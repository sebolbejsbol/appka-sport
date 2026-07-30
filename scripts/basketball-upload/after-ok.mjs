#!/usr/bin/env node
/** After MCP success: mark key, prep next, write _exec-query.txt for agent MCP call. */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const key = process.argv[2];
if (!key) {
  console.error('Usage: after-ok.mjs <key>');
  process.exit(1);
}
spawnSync(process.execPath, [apply, 'mark', key], { cwd: root, stdio: 'inherit' });
const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
writeFileSync(path.join(root, 'scripts/.cache/_exec-query.txt'), sql, 'utf8');
writeFileSync(path.join(root, 'scripts/.cache/_exec-key.txt'), meta.key, 'utf8');
writeFileSync(
  path.join(root, 'scripts/.cache/_mcp-call-args.json'),
  JSON.stringify({ query: sql }),
  'utf8',
);
console.log(JSON.stringify({ key: meta.key, bytes: sql.length, marked: key }));
