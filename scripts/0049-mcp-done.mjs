#!/usr/bin/env node
/** Mark chunk or part done after successful MCP call. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const markScript = path.join(root, 'scripts', 'apply-0049-parts.mjs');

const mode = process.argv[2]; // chunk | part
const part = Number(process.argv[3]);
const chunk = process.argv[4] ? Number(process.argv[4]) : null;

if (!mode || !part) {
  console.error('Usage: 0049-mcp-done.mjs chunk <P> <C> | part <P>');
  process.exit(1);
}

if (mode === 'chunk') {
  fs.writeFileSync(path.join(partsDir, `_done-p${part}c${chunk}.flag`), new Date().toISOString(), 'utf8');
  const all = [1, 2, 3, 4, 5].every((c) =>
    fs.existsSync(path.join(partsDir, `_done-p${part}c${c}.flag`)),
  );
  if (all) {
    spawnSync(process.execPath, [markScript, 'mark', String(part)], { stdio: 'inherit' });
  }
  console.log(JSON.stringify({ mode, part, chunk, partMarked: all }));
} else {
  spawnSync(process.execPath, [markScript, 'mark', String(part)], { stdio: 'inherit' });
  console.log(JSON.stringify({ mode, part, marked: true }));
}
