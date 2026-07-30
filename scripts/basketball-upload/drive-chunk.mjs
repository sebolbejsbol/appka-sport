#!/usr/bin/env node
/**
 * Drive manual loop from shell: prep -> agent MCP -> mark/fail.
 * Usage:
 *   node drive-chunk.mjs once ok <key>   # mark after successful MCP
 *   node drive-chunk.mjs once fail <key> # fail after MCP error
 *   node drive-chunk.mjs prep            # apply.mjs next -> _mcp-args.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const out = path.join(root, 'scripts/.cache/_mcp-args.json');
const [cmd, sub, key] = process.argv.slice(2);

if (cmd === 'once' && sub === 'ok' && key) {
  spawnSync(process.execPath, [apply, 'mark', key], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}
if (cmd === 'once' && sub === 'fail' && key) {
  spawnSync(process.execPath, [apply, 'fail', key], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}

const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
writeFileSync(out, JSON.stringify({ key: meta.key, query: sql }), 'utf8');
console.log(JSON.stringify({ key: meta.key, bytes: sql.length }));
