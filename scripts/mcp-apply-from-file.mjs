#!/usr/bin/env node
/** Print apply_migration args JSON to stdout for a part (UTF-8). Usage: node mcp-apply-from-file.mjs <N> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const part = String(Number(process.argv[2])).padStart(2, '0');
const p = path.join(root, '.tmp-0049-parts', `_apply-${part}.json`);
const j = JSON.parse(fs.readFileSync(p, 'utf8'));
process.stdout.write(JSON.stringify({ name: j.name, query: j.query }));
