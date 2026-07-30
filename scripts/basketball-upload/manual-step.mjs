#!/usr/bin/env node
/**
 * Manual loop helper (apply.mjs next -> stdout JSON with key+query).
 * Agent: CallMcpTool execute_sql -> node manual-step.mjs mark|fail <key>
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'mark' && arg) {
  spawnSync(process.execPath, [apply, 'mark', arg], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}
if (cmd === 'fail' && arg) {
  spawnSync(process.execPath, [apply, 'fail', arg], { cwd: root, stdio: 'inherit' });
  process.exit(0);
}

const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
console.log(JSON.stringify({ key: meta.key, part: meta.part, chunk: meta.chunk, query: sql }));
