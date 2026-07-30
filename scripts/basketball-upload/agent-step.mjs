#!/usr/bin/env node
/**
 * Agent helper: after MCP execute_sql, run mark+prep next.
 * Usage: node agent-step.mjs ok <key>  |  node agent-step.mjs fail <key>
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const mcpQuery = path.join(root, 'scripts/basketball-upload/mcp-query.mjs');

const cmd = process.argv[2];
const key = process.argv[3];

if (cmd === 'ok' && key) {
  spawnSync(process.execPath, [apply, 'mark', key], { cwd: root, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [mcpQuery], { cwd: root, encoding: 'utf8' });
  const meta = JSON.parse(r.stdout.trim());
  console.log(JSON.stringify(meta.done ? { done: true } : { next: meta.key, bytes: meta.bytes }));
} else if (cmd === 'fail' && key) {
  spawnSync(process.execPath, [apply, 'fail', key], { cwd: root, encoding: 'utf8' });
  const r = spawnSync(process.execPath, [mcpQuery], { cwd: root, encoding: 'utf8' });
  const meta = JSON.parse(r.stdout.trim());
  console.log(JSON.stringify(meta.done ? { done: true } : { next: meta.key, bytes: meta.bytes }));
} else {
  console.error('Usage: agent-step.mjs ok|fail <key>');
  process.exit(1);
}
