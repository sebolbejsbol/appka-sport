#!/usr/bin/env node
/** Prepare one chunk for MCP: writes _mcp-query.json with {key,query} or {done:true} */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const outFile = path.join(root, 'scripts/.cache/_mcp-query.json');

const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  writeFileSync(outFile, JSON.stringify({ done: true }), 'utf8');
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
writeFileSync(outFile, JSON.stringify({ key: meta.key, query: sql }), 'utf8');
console.log(JSON.stringify({ key: meta.key, bytes: sql.length }));
