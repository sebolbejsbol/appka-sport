#!/usr/bin/env node
/**
 * Agent batch driver: stage one chunk, agent runs MCP on _basketball-next.sql, then mark.
 * Usage:
 *   node agent-batch.mjs next     -> {key, bytes} stages SQL
 *   node agent-batch.mjs mark K   -> mark key, return next meta or done
 *   node agent-batch.mjs fail K   -> fail key, return next meta or done
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
  return JSON.parse(r.stdout.trim());
}

if (cmd === 'next') {
  console.log(JSON.stringify(run(['next'])));
} else if (cmd === 'mark' && key) {
  run(['mark', key]);
  const n = run(['next']);
  console.log(JSON.stringify(n.done ? { done: true, marked: key } : { marked: key, next: n }));
} else if (cmd === 'fail' && key) {
  run(['fail', key]);
  const n = run(['next']);
  console.log(JSON.stringify(n.done ? { done: true, failed: key } : { failed: key, next: n }));
} else {
  console.error('Usage: next | mark <key> | fail <key>');
  process.exit(1);
}
