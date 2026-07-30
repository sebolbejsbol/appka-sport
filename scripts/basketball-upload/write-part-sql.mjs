#!/usr/bin/env node
/** Write part SQL to _exec-query.txt. Usage: node write-part-sql.mjs 17 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import path from 'node:path';
import { readSql, key } from './lib/chunks.mjs';

const part = Number(process.argv[2]);
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const cache = path.join(root, 'scripts/.cache');

let sql = '';
const keys = [];
for (let c = 1; c <= 5; c++) {
  keys.push(key(part, c));
  sql += readSql(part, c);
}
writeFileSync(path.join(cache, '_exec-query.txt'), sql, 'utf8');
writeFileSync(path.join(cache, '_exec-key.txt'), keys.join(','), 'utf8');
console.log(JSON.stringify({ part, keys, bytes: sql.length }));
