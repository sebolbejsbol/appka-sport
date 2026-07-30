#!/usr/bin/env node
/** One manual-loop iteration: apply.mjs next -> write _mcp-args.json {key,query} */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const out = path.join(root, 'scripts/.cache/_mcp-args.json');

const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
writeFileSync(out, JSON.stringify({ key: meta.key, query: sql }), 'utf8');
console.log(JSON.stringify({ key: meta.key, bytes: sql.length, argsFile: out }));
