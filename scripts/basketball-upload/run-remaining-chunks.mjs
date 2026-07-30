#!/usr/bin/env node
/**
 * Emit pending chunk keys for agent MCP loop (no flag files).
 * Usage: node run-remaining-chunks.mjs list
 *        node run-remaining-chunks.mjs stage <key>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const cache = path.join(root, 'scripts/.cache');

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'list') {
  const keys = pending().map((c) => key(c.part, c.chunk));
  console.log(JSON.stringify({ remaining: keys.length, keys }));
} else if (cmd === 'stage' && arg) {
  const [p, c] = arg.split('-').map(Number);
  const sql = readSql(p, c);
  writeFileSync(path.join(cache, '_exec-query.txt'), sql, 'utf8');
  writeFileSync(path.join(cache, '_exec-key.txt'), arg, 'utf8');
  writeFileSync(path.join(cache, '_mcp-call-args.json'), JSON.stringify({ query: sql }), 'utf8');
  console.log(JSON.stringify({ key: arg, bytes: sql.length }));
} else if (cmd === 'mark' && arg) {
  spawnSync(process.execPath, [apply, 'mark', arg], { cwd: root, stdio: 'inherit' });
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true, marked: arg }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  writeFileSync(path.join(cache, '_exec-query.txt'), sql, 'utf8');
  writeFileSync(path.join(cache, '_exec-key.txt'), k, 'utf8');
  writeFileSync(path.join(cache, '_mcp-call-args.json'), JSON.stringify({ query: sql }), 'utf8');
  console.log(JSON.stringify({ marked: arg, next: k, bytes: sql.length }));
} else if (cmd === 'fail' && arg) {
  spawnSync(process.execPath, [apply, 'fail', arg], { cwd: root, stdio: 'inherit' });
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true, failed: arg }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  writeFileSync(path.join(cache, '_exec-query.txt'), sql, 'utf8');
  writeFileSync(path.join(cache, '_exec-key.txt'), k, 'utf8');
  writeFileSync(path.join(cache, '_mcp-call-args.json'), JSON.stringify({ query: sql }), 'utf8');
  console.log(JSON.stringify({ failed: arg, next: k, bytes: sql.length }));
} else {
  console.error('Usage: list | stage <key> | mark <key> | fail <key>');
  process.exit(1);
}
