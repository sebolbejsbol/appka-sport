#!/usr/bin/env node
/** Prep MCP args for chunk key: writes scripts/.cache/_mcp-args-only.json {query} */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readSql } from './lib/chunks.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const k = process.argv[2];
if (!k || !/^\d{2}-\d{2}$/.test(k)) {
  console.error('Usage: prep-mcp-key.mjs 09-05');
  process.exit(1);
}
const [part, chunk] = k.split('-').map(Number);
const query = readSql(part, chunk);
const out = path.join(root, 'scripts/.cache/_mcp-args-only.json');
const sqlOut = path.join(root, 'scripts/.cache/_query-only.sql');
writeFileSync(out, JSON.stringify({ key: k, query }), 'utf8');
writeFileSync(sqlOut, query, 'utf8');
console.log(JSON.stringify({ key: k, bytes: query.length, argsFile: out, sqlFile: sqlOut }));
