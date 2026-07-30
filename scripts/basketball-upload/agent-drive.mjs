#!/usr/bin/env node
/**
 * Drive agent MCP loop: prints staged chunk, agent MCPs _basketball-next.sql, then mark.
 *   node agent-drive.mjs step     # stage next -> {key, bytes}
 *   node agent-drive.mjs done K   # mark K after successful MCP
 *   node agent-drive.mjs err K    # fail K after MCP error, stage next
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const cmd = process.argv[2];
const key = process.argv[3];

function run(args) {
  const r = spawnSync(process.execPath, [apply, ...args], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  return JSON.parse(r.stdout.trim());
}

if (cmd === 'step') {
  const n = run(['next']);
  if (n.done) {
    console.log(JSON.stringify({ done: true }));
  } else {
    console.log(JSON.stringify({ key: n.key, bytes: n.bytes, sqlFile: n.sqlFile }));
  }
} else if (cmd === 'done' && key) {
  run(['mark', key]);
  const n = run(['next']);
  console.log(JSON.stringify(n.done ? { done: true, marked: key } : { marked: key, nextKey: n.key, nextBytes: n.bytes }));
} else if (cmd === 'err' && key) {
  run(['fail', key]);
  const n = run(['next']);
  console.log(JSON.stringify(n.done ? { done: true, failed: key } : { failed: key, nextKey: n.key, nextBytes: n.bytes }));
} else {
  console.error('Usage: step | done <key> | err <key>');
  process.exit(1);
}
