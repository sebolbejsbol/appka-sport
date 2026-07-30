#!/usr/bin/env node
/** Write pending chunk SQL files to .cache/batch/ for MCP upload. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';
import { abs } from './lib/paths.mjs';

const n = Number(process.argv[2] || 10);
const done = new Set(load().completed);
const outDir = abs('scripts/.cache/batch');
mkdirSync(outDir, { recursive: true });

const batch = [];
for (const c of allChunks()) {
  const k = key(c.part, c.chunk);
  if (done.has(k)) continue;
  const sql = readSql(c.part, c.chunk);
  const file = join(outDir, `${k}.sql`);
  writeFileSync(file, sql, 'utf8');
  batch.push({ key: k, file, bytes: sql.length });
  if (batch.length >= n) break;
}
writeFileSync(join(outDir, '_manifest.json'), JSON.stringify(batch), 'utf8');
console.log(JSON.stringify({ count: batch.length, keys: batch.map((b) => b.key) }));
