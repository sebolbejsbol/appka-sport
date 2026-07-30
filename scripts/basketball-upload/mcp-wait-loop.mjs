#!/usr/bin/env node
/**
 * Agent-driven upload loop: stages SQL, prints key, waits for flag file, marks, repeats.
 * Agent: read _current-query.sql -> CallMcpTool execute_sql -> touch _mcp-done.flag
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
const queryFile = path.join(cache, '_current-query.sql');
const flagFile = path.join(cache, '_mcp-done.flag');
const statusFile = path.join(cache, '_mcp-loop-status.json');

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

function writeStatus(obj) {
  fs.writeFileSync(statusFile, JSON.stringify(obj, null, 2));
}

function waitFlag(timeoutMs = 600000) {
  const start = Date.now();
  while (!fs.existsSync(flagFile)) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for _mcp-done.flag');
    spawnSync(process.platform === 'win32' ? 'powershell' : 'sleep', process.platform === 'win32' ? ['-Command', 'Start-Sleep -Milliseconds 300'] : ['0.3'], { stdio: 'ignore' });
  }
  fs.unlinkSync(flagFile);
}

const cmd = process.argv[2] || 'run';

if (cmd === 'stage') {
  const next = pending()[0];
  if (!next) {
    writeStatus({ done: true });
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  fs.writeFileSync(queryFile, sql, 'utf8');
  if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);
  writeStatus({ key: k, bytes: sql.length, waiting: true });
  console.log(JSON.stringify({ key: k, bytes: sql.length, queryFile }));
} else if (cmd === 'complete' && process.argv[3]) {
  const k = process.argv[3];
  spawnSync(process.execPath, [apply, 'mark', k], { cwd: root, encoding: 'utf8' });
  const remaining = pending().length;
  writeStatus({ marked: k, remaining });
  console.log(JSON.stringify({ marked: k, remaining }));
} else if (cmd === 'fail' && process.argv[3]) {
  const k = process.argv[3];
  spawnSync(process.execPath, [apply, 'fail', k], { cwd: root, encoding: 'utf8' });
  console.log(JSON.stringify({ failed: k, remaining: pending().length }));
} else if (cmd === 'run') {
  const results = { ok: [], failed: [] };
  for (const c of pending()) {
    const k = key(c.part, c.chunk);
    const sql = readSql(c.part, c.chunk);
    fs.writeFileSync(queryFile, sql, 'utf8');
    if (fs.existsSync(flagFile)) fs.unlinkSync(flagFile);
    writeStatus({ key: k, bytes: sql.length, waiting: true, ok: results.ok.length, failed: results.failed.length });
    console.log(`STAGE ${k}`);
    try {
      waitFlag();
      spawnSync(process.execPath, [apply, 'mark', k], { cwd: root, encoding: 'utf8' });
      results.ok.push(k);
      console.log(`OK ${k}`);
    } catch (e) {
      spawnSync(process.execPath, [apply, 'fail', k], { cwd: root, encoding: 'utf8' });
      results.failed.push({ key: k, error: String(e.message || e) });
      console.error(`FAIL ${k}: ${e.message || e}`);
    }
  }
  writeStatus({ done: true, results });
  console.log(JSON.stringify(results));
} else {
  console.error('Usage: stage | complete <key> | fail <key> | run');
  process.exit(1);
}
