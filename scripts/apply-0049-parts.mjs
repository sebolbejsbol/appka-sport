#!/usr/bin/env node
/** Mark part N complete/failed in progress file. Usage: apply-0049-parts.mjs mark|fail <N> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const progressPath = path.join(root, 'scripts', '.cache', '0049-apply-progress.json');
const cmd = process.argv[2];
const part = Number(process.argv[3]);

if (!cmd || !part) {
  console.error('Usage: apply-0049-parts.mjs mark|fail <N>');
  process.exit(1);
}

let p = { completed: [], failed: [] };
try {
  p = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
} catch {}

if (cmd === 'mark') {
  if (!p.completed.includes(part)) p.completed.push(part);
  p.completed.sort((a, b) => a - b);
  p.failed = (p.failed || []).filter((n) => n !== part);
} else if (cmd === 'fail') {
  if (!p.failed.includes(part)) p.failed.push(part);
  p.failed.sort((a, b) => a - b);
} else {
  console.error('Unknown command:', cmd);
  process.exit(1);
}

fs.mkdirSync(path.dirname(progressPath), { recursive: true });
fs.writeFileSync(progressPath, JSON.stringify(p, null, 2), 'utf8');
console.log(JSON.stringify({ cmd, part, progress: p }));
