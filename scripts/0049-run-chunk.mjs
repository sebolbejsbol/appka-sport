#!/usr/bin/env node
/** Prepare single chunk MCP args file. Usage: 0049-run-chunk.mjs <part> <chunk> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const part = Number(process.argv[2]);
const chunk = Number(process.argv[3]);
const nn = String(part).padStart(2, '0');
const sqlPath = path.join(partsDir, 'chunks', nn, `chunk-0${chunk}.sql`);
const outPath = path.join(partsDir, `_args-p${part}c${chunk}.json`);

const query = fs.readFileSync(sqlPath, 'utf8');
fs.writeFileSync(outPath, JSON.stringify({ query }), 'utf8');
process.stdout.write(JSON.stringify({ part, chunk, outPath, queryLen: query.length }));
