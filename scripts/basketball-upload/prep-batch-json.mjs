#!/usr/bin/env node
/** Stage N pending chunks as JSON files for parallel MCP. */
import fs from 'node:fs';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';
import { abs } from './lib/paths.mjs';

const limit = Number(process.argv[2] || 5);
const done = new Set(load().completed);
const dir = abs('scripts/.cache/_mcp-batch');
fs.mkdirSync(dir, { recursive: true });
const keys = [];
let n = 0;
for (const c of allChunks()) {
  const k = key(c.part, c.chunk);
  if (done.has(k)) continue;
  fs.writeFileSync(
    `${dir}/${k}.json`,
    JSON.stringify({ key: k, query: readSql(c.part, c.chunk) }),
  );
  keys.push(k);
  if (++n >= limit) break;
}
console.log(JSON.stringify({ keys, dir }));
