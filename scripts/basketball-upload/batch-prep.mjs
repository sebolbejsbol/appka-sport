#!/usr/bin/env node
/** Output JSON array of {key,query} for next N pending chunks. */
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const n = Number(process.argv[2] || 5);
const done = new Set(load().completed);
const batch = [];
for (const c of allChunks()) {
  const k = key(c.part, c.chunk);
  if (done.has(k)) continue;
  batch.push({ key: k, query: readSql(c.part, c.chunk) });
  if (batch.length >= n) break;
}
console.log(JSON.stringify(batch));
