#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { abs, CHUNKS } from './lib/paths.mjs';
import { allChunks, key } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';

const part = Number(process.argv[2]);
if (!part) {
  console.error('Usage: part-chunk-keys.mjs <part>');
  process.exit(1);
}
const done = new Set(load().completed);
const keys = allChunks()
  .filter((c) => c.part === part && !done.has(key(c.part, c.chunk)))
  .map((c) => key(c.part, c.chunk));
const nn = String(part).padStart(2, '0');
const partSql = abs(`supabase/migrations/parts/0049/0049_part_${nn}.sql`);
console.log(
  JSON.stringify({
    part,
    pendingKeys: keys,
    partSql,
    partSqlExists: existsSync(partSql),
    partSqlBytes: existsSync(partSql) ? readFileSync(partSql, 'utf8').length : 0,
  }),
);
