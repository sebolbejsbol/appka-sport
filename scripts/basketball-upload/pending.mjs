#!/usr/bin/env node
/** List all pending chunks with SQL paths as JSON lines on stdout. */
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const done = new Set(load().completed);
for (const c of allChunks()) {
  const k = key(c.part, c.chunk);
  if (done.has(k)) continue;
  console.log(JSON.stringify({ key: k, part: c.part, chunk: c.chunk, rows: c.rows }));
}
