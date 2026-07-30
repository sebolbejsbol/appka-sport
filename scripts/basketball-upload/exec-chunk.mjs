#!/usr/bin/env node
/** Copy chunk SQL to _basketball-next.sql for MCP. Usage: node exec-chunk.mjs 02-02 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const key = process.argv[2];
if (!key) {
  console.error('Usage: exec-chunk.mjs <key>');
  process.exit(1);
}
const src = path.join(root, 'scripts/.cache/batch', `${key}.sql`);
const dst = path.join(root, 'scripts/.cache/_basketball-next.sql');
const sql = fs.readFileSync(src, 'utf8');
fs.writeFileSync(dst, sql, 'utf8');
console.log(JSON.stringify({ key, bytes: sql.length, sqlFile: dst }));
