#!/usr/bin/env node
/** Output {key, query} for a chunk key. Usage: node read-batch-key.mjs 12-01 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readSql } from './lib/chunks.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const k = process.argv[2];
if (!k || !/^\d{2}-\d{2}$/.test(k)) {
  console.error('Usage: node read-batch-key.mjs NN-MM');
  process.exit(1);
}
const batch = path.join(root, 'scripts/.cache/_mcp-batch', `${k}.json`);
if (fs.existsSync(batch)) {
  process.stdout.write(fs.readFileSync(batch, 'utf8'));
  process.exit(0);
}
const [part, chunk] = k.split('-').map(Number);
process.stdout.write(JSON.stringify({ key: k, query: readSql(part, chunk) }));
