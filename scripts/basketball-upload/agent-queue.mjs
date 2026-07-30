#!/usr/bin/env node
/**
 * Queue driver for agent MCP loop. Uses per-key done files to avoid stale flags.
 *   node agent-queue.mjs run          # background: stage chunks, wait for done/<key>
 *   node agent-queue.mjs current      # {key, bytes} + SQL in _basketball-next.sql
 *   node agent-queue.mjs finish <key> # write done/<key> after MCP success
 *   node agent-queue.mjs fail <key>   # mark failed + advance
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const cache = path.join(root, 'scripts/.cache');
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const doneDir = path.join(cache, 'basketball-done');
const queueFile = path.join(cache, 'basketball-queue.json');

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

function stage(c) {
  const k = key(c.part, c.chunk);
  const sql = readSql(c.part, c.chunk);
  fs.writeFileSync(path.join(cache, '_basketball-next.sql'), sql, 'utf8');
  fs.writeFileSync(queueFile, JSON.stringify({ key: k, bytes: sql.length, waiting: true }), 'utf8');
  return k;
}

function waitDone(k, timeoutMs = 600000) {
  const f = path.join(doneDir, k);
  const start = Date.now();
  while (!fs.existsSync(f)) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout ${k}`);
    spawnSync(process.platform === 'win32' ? 'powershell' : 'sleep', process.platform === 'win32' ? ['-Command', 'Start-Sleep -Milliseconds 300'] : ['0.3'], { stdio: 'ignore' });
  }
  fs.unlinkSync(f);
}

const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'run') {
  fs.mkdirSync(doneDir, { recursive: true });
  const results = { ok: [], failed: [] };
  for (const c of pending()) {
    const k = stage(c);
    console.log(`STAGE ${k}`);
    try {
      waitDone(k);
      spawnSync(process.execPath, [apply, 'mark', k], { cwd: root, encoding: 'utf8' });
      results.ok.push(k);
      console.log(`OK ${k}`);
    } catch (e) {
      spawnSync(process.execPath, [apply, 'fail', k], { cwd: root, encoding: 'utf8' });
      results.failed.push({ key: k, error: String(e.message || e) });
      console.error(`FAIL ${k}: ${e.message || e}`);
    }
  }
  fs.writeFileSync(path.join(cache, 'basketball-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} else if (cmd === 'current') {
  if (fs.existsSync(queueFile)) {
    console.log(fs.readFileSync(queueFile, 'utf8'));
    process.exit(0);
  }
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  const k = stage(next);
  console.log(JSON.stringify({ key: k, bytes: readSql(next.part, next.chunk).length }));
} else if (cmd === 'finish' && arg) {
  fs.mkdirSync(doneDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, arg), 'ok', 'utf8');
  console.log(JSON.stringify({ finished: arg }));
} else if (cmd === 'fail' && arg) {
  spawnSync(process.execPath, [apply, 'fail', arg], { cwd: root, encoding: 'utf8' });
  fs.mkdirSync(doneDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, arg), 'fail', 'utf8');
  console.log(JSON.stringify({ failed: arg }));
} else {
  console.error('Usage: run | current | finish <key> | fail <key>');
  process.exit(1);
}
