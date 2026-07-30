#!/usr/bin/env node
/**
 * Prepare chunk MCP args for part N. Usage: prepare-chunk-args.mjs <part> [chunk]
 * Without chunk: prepares all 5 chunks as _p{NN}c{1-5}.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const part = Number(process.argv[2]);
const chunkOnly = process.argv[3] ? Number(process.argv[3]) : null;
const nn = String(part).padStart(2, '0');
const chunkDir = path.join(partsDir, 'chunks', nn);

if (!part) {
  console.error('Usage: prepare-chunk-args.mjs <part> [chunk]');
  process.exit(1);
}

const chunks = chunkOnly ? [chunkOnly] : [1, 2, 3, 4, 5];
const out = [];
for (const c of chunks) {
  const sqlPath = path.join(chunkDir, `chunk-0${c}.sql`);
  const q = fs.readFileSync(sqlPath, 'utf8');
  const outPath = path.join(partsDir, `_p${part}c${c}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ query: q }), 'utf8');
  out.push({ chunk: c, len: q.length, outPath });
}
console.log(JSON.stringify({ part, chunks: out }));
