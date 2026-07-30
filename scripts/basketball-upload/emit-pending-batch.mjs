#!/usr/bin/env node
/** Emit next N pending chunks as JSON lines: {key, sql} */
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const limit = Number(process.argv[2] || 10);
const done = new Set(load().completed);
let n = 0;
for (const c of allChunks()) {
  const k = key(c.part, c.chunk);
  if (done.has(k)) continue;
  console.log(JSON.stringify({ key: k, sql: readSql(c.part, c.chunk) }));
  if (++n >= limit) break;
}
