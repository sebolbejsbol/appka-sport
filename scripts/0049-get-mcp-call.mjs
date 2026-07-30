#!/usr/bin/env node
/**
 * Print next MCP call descriptor for 0049 parts 2-33.
 * Usage:
 *   node 0049-get-mcp-call.mjs next          # next pending call
 *   node 0049-get-mcp-call.mjs chunk <P> <C> # specific chunk execute_sql
 *   node 0049-get-mcp-call.mjs part <N>       # full part (execute<=5, apply>5)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const progressPath = path.join(root, 'scripts', '.cache', '0049-apply-progress.json');

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  } catch {
    return { completed: [], failed: [] };
  }
}

function chunkCall(part, chunk) {
  const nn = String(part).padStart(2, '0');
  const sqlPath = path.join(partsDir, 'chunks', nn, `chunk-0${chunk}.sql`);
  const query = fs.readFileSync(sqlPath, 'utf8');
  return {
    part,
    chunk,
    tool: 'execute_sql',
    arguments: { query },
    queryLen: query.length,
  };
}

function partCall(part) {
  const nn = String(part).padStart(2, '0');
  if (part <= 5) {
    const query = fs.readFileSync(path.join(partsDir, `q-${nn}.sql`), 'utf8');
    return {
      part,
      tool: 'execute_sql',
      arguments: { query },
      queryLen: query.length,
      migrationName: `osm_basketball_poland_part_${nn}`,
      skipMigration: true,
    };
  }
  const payload = JSON.parse(fs.readFileSync(path.join(partsDir, `_apply-${nn}.json`), 'utf8'));
  return {
    part,
    tool: 'apply_migration',
    arguments: { name: payload.name, query: payload.query },
    queryLen: payload.query.length,
    migrationName: payload.name,
  };
}

function nextPending() {
  const p = loadProgress();
  const completed = new Set(p.completed || []);
  for (let part = 2; part <= 33; part++) {
    if (completed.has(part)) continue;
    for (let c = 1; c <= 5; c++) {
      const flag = path.join(partsDir, `_done-p${part}c${c}.flag`);
      if (!fs.existsSync(flag)) return { kind: 'chunk', part, chunk: c };
    }
    return { kind: 'mark', part };
  }
  return { kind: 'done' };
}

const mode = process.argv[2];
let out;
if (mode === 'chunk') {
  out = chunkCall(Number(process.argv[3]), Number(process.argv[4]));
} else if (mode === 'part') {
  out = partCall(Number(process.argv[3]));
} else if (mode === 'next') {
  const n = nextPending();
  if (n.kind === 'chunk') out = { ...chunkCall(n.part, n.chunk), kind: 'chunk' };
  else if (n.kind === 'part') out = { ...partCall(n.part), kind: 'part' };
  else out = n;
} else {
  console.error('Usage: 0049-get-mcp-call.mjs next|part <N>|chunk <P> <C>');
  process.exit(1);
}

const outPath = path.join(partsDir, '_mcp-current-call.json');
fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
process.stdout.write(JSON.stringify({ ...out, outPath, queryLen: out.queryLen ?? out.arguments?.query?.length }));
