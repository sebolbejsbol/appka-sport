#!/usr/bin/env node
/**
 * Agent helper: process one chunk end-to-end when MCP done externally.
 * Usage:
 *   node process-one.mjs prepare   # -> {key, sqlFile}
 *   node process-one.mjs mark <key>
 *   node process-one.mjs fail <key>
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'prepare') {
  const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
  const meta = JSON.parse(r.stdout.trim());
  if (meta.done) {
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  const sql = readFileSync(meta.sqlFile, 'utf8');
  writeFileSync(path.join(root, 'scripts/.cache/_mcp-query.json'), JSON.stringify({ key: meta.key, query: sql }), 'utf8');
  console.log(JSON.stringify({ key: meta.key, bytes: sql.length, queryFile: path.join(root, 'scripts/.cache/_mcp-query.json') }));
} else if (cmd === 'mark' && arg) {
  spawnSync(process.execPath, [apply, 'mark', arg], { cwd: root, stdio: 'inherit' });
} else if (cmd === 'fail' && arg) {
  spawnSync(process.execPath, [apply, 'fail', arg], { cwd: root, stdio: 'inherit' });
} else {
  console.error('Usage: prepare | mark <key> | fail <key>');
  process.exit(1);
}
