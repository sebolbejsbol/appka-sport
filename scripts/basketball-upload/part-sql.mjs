#!/usr/bin/env node
/** Output combined chunk SQL for a part. Usage: node part-sql.mjs 17 */
import { readSql, key } from './lib/chunks.mjs';
const part = Number(process.argv[2]);
if (!part) {
  console.error('Usage: part-sql.mjs <part>');
  process.exit(1);
}
let sql = '';
const keys = [];
for (let c = 1; c <= 5; c++) {
  keys.push(key(part, c));
  sql += readSql(part, c);
}
process.stdout.write(JSON.stringify({ part, keys, bytes: sql.length, query: sql }));
