#!/usr/bin/env node
/** Write SQL for chunk key to scripts/.cache/_query-only.sql */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readSql } from './lib/chunks.mjs';

const k = process.argv[2];
if (!k || !/^\d{2}-\d{2}$/.test(k)) {
  console.error('Usage: prep-key.mjs 01-03');
  process.exit(1);
}
const [part, chunk] = k.split('-').map(Number);
const sql = readSql(part, chunk);
const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(projectRoot, 'scripts', '.cache', '_query-only.sql');
writeFileSync(out, sql, 'utf8');
console.log(JSON.stringify({ key: k, bytes: sql.length }));
