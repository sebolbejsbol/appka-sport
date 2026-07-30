#!/usr/bin/env node
/**
 * Output MCP call payload for part N (for agent CallMcpTool).
 * Usage: node scripts/mcp-args-for-part.mjs <N> [chunk]
 * Writes .tmp-0049-parts/_mcp-tool-args.json and prints summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const part = Number(process.argv[2]);
const chunk = process.argv[3] ? Number(process.argv[3]) : null;
const nn = String(part).padStart(2, '0');

if (!part) {
  console.error('Usage: mcp-args-for-part.mjs <N> [chunk]');
  process.exit(1);
}

let tool, args;
if (chunk) {
  const sqlPath = path.join(partsDir, 'chunks', nn, `chunk-0${chunk}.sql`);
  args = { query: fs.readFileSync(sqlPath, 'utf8') };
  tool = 'execute_sql';
} else if (part <= 5) {
  args = { query: fs.readFileSync(path.join(partsDir, `q-${nn}.sql`), 'utf8') };
  tool = 'execute_sql';
} else {
  const payload = JSON.parse(fs.readFileSync(path.join(partsDir, `_apply-${nn}.json`), 'utf8'));
  tool = 'apply_migration';
  args = { name: payload.name, query: payload.query };
}

const out = { part, chunk, tool, args, queryLen: args.query.length };
fs.writeFileSync(path.join(partsDir, '_mcp-tool-args.json'), JSON.stringify(out), 'utf8');
console.log(JSON.stringify({ part, chunk, tool, queryLen: args.query.length, name: args.name }));
