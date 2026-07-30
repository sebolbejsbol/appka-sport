#!/usr/bin/env node
/** Output { key, query } JSON for the next pending chunk. */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(path.dirname(scriptsDir));
const apply = path.join(scriptsDir, 'apply.mjs');
const outFile = path.join(root, 'scripts', '.cache', '_mcp-query.json');

const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
const meta = JSON.parse(r.stdout.trim());
if (meta.done) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}
const sql = readFileSync(meta.sqlFile, 'utf8');
writeFileSync(outFile, JSON.stringify({ key: meta.key, query: sql }), 'utf8');
console.log(JSON.stringify({ key: meta.key, bytes: sql.length }));
