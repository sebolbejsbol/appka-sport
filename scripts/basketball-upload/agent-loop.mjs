#!/usr/bin/env node
/**
 * Print next pending chunk key + SQL path for agent MCP loop.
 * Usage: node agent-loop.mjs current | node agent-loop.mjs after <key>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const cacheDir = path.join(root, 'scripts/.cache');
const cmd = process.argv[2];
const arg = process.argv[3];

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

if (cmd === 'current') {
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  const sqlFile = path.join(cacheDir, '_basketball-next.sql');
  const queryFile = path.join(cacheDir, '_mcp-query-only.sql');
  writeFileSync(sqlFile, sql, 'utf8');
  writeFileSync(queryFile, sql, 'utf8');
  writeFileSync(path.join(cacheDir, '_mcp-query.json'), JSON.stringify({ key: k, query: sql }), 'utf8');
  console.log(JSON.stringify({ key: k, bytes: sql.length, sqlFile: queryFile }));
} else if (cmd === 'after' && arg) {
  spawnSync(process.execPath, [apply, 'mark', arg], { cwd: root, encoding: 'utf8' });
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true, marked: arg }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  const queryFile = path.join(cacheDir, '_mcp-query-only.sql');
  writeFileSync(queryFile, sql, 'utf8');
  writeFileSync(path.join(cacheDir, '_mcp-query.json'), JSON.stringify({ key: k, query: sql }), 'utf8');
  console.log(JSON.stringify({ marked: arg, next: k, bytes: sql.length, sqlFile: queryFile }));
} else if (cmd === 'fail' && arg) {
  spawnSync(process.execPath, [apply, 'fail', arg], { cwd: root, encoding: 'utf8' });
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true, failed: arg }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  const queryFile = path.join(cacheDir, '_mcp-query-only.sql');
  writeFileSync(queryFile, sql, 'utf8');
  console.log(JSON.stringify({ failed: arg, next: k, bytes: sql.length, sqlFile: queryFile }));
} else if (cmd === 'status') {
  const p = load();
  console.log(JSON.stringify({
    completed: p.completed.length,
    failed: p.failed?.length ?? 0,
    total: allChunks().length,
    remaining: allChunks().length - p.completed.length,
    next: pending()[0] ? key(pending()[0].part, pending()[0].chunk) : null,
  }));
} else {
  console.error('Usage: current | after <key> | fail <key> | status');
  process.exit(1);
}
