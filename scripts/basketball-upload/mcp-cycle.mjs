#!/usr/bin/env node
/**
 * One manual-loop cycle helper for agent:
 *   node mcp-cycle.mjs prep     -> stages next chunk to _mcp-query.json
 *   node mcp-cycle.mjs ok <key> -> mark + prep next
 *   node mcp-cycle.mjs fail <key> -> fail + prep next
 * Agent: read _mcp-query.json query -> CallMcpTool execute_sql -> ok|fail
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const outFile = path.join(root, 'scripts/.cache/_mcp-query.json');
const cmd = process.argv[2];
const key = process.argv[3];

function prep() {
  const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
  const meta = JSON.parse(r.stdout.trim());
  if (meta.done) {
    console.log(JSON.stringify({ done: true }));
    return;
  }
  const sql = readFileSync(meta.sqlFile, 'utf8');
  writeFileSync(outFile, JSON.stringify({ key: meta.key, query: sql }), 'utf8');
  console.log(JSON.stringify({ key: meta.key, bytes: sql.length, queryFile: outFile }));
}

if (cmd === 'prep') {
  prep();
} else if ((cmd === 'ok' || cmd === 'fail') && key) {
  spawnSync(process.execPath, [apply, cmd === 'ok' ? 'mark' : 'fail', key], {
    cwd: root,
    stdio: 'inherit',
  });
  prep();
} else {
  console.error('Usage: mcp-cycle.mjs prep | ok <key> | fail <key>');
  process.exit(1);
}
