#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { abs } from './lib/paths.mjs';

const out = execSync('node scripts/basketball-upload/apply.mjs next', {
  encoding: 'utf8',
  cwd: abs('.'),
}).trim();
const meta = JSON.parse(out);
if (meta.done) {
  console.log(JSON.stringify(meta));
  process.exit(0);
}
const sql = readFileSync(abs('scripts/.cache/_basketball-next.sql'), 'utf8');
const payload = { ...meta, query: sql };
writeFileSync(abs('scripts/.cache/_current-chunk.json'), JSON.stringify(payload), 'utf8');
console.log(JSON.stringify({ key: meta.key, bytes: sql.length }));
