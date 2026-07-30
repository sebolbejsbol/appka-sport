#!/usr/bin/env node
/** Output JSON array of {key, query} for next N pending chunks (default 1). */
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const n = Number(process.argv[2] || 1);
const done = new Set(load().completed);
const pending = allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
const batch = pending.slice(0, n).map((c) => {
  const k = key(c.part, c.chunk);
  return { key: k, query: readSql(c.part, c.chunk), bytes: readSql(c.part, c.chunk).length };
});
if (!batch.length) {
  console.log(JSON.stringify({ done: true }));
} else {
  console.log(JSON.stringify({ batch, remaining: pending.length - batch.length }));
}
