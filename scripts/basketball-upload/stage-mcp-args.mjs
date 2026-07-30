#!/usr/bin/env node
/**
 * Read staged _basketball-next.sql and output MCP args file.
 * Agent: CallMcpTool execute_sql with JSON.parse(readFileSync(argsFile)).query
 * Then: node apply.mjs mark <key>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const sqlFile = path.join(root, 'scripts/.cache/_basketball-next.sql');
const metaFile = path.join(root, 'scripts/.cache/_basketball-next-meta.json');
const argsFile = path.join(root, 'scripts/.cache/_mcp-args.json');

const query = fs.readFileSync(sqlFile, 'utf8');
let key = process.argv[2];
if (!key && fs.existsSync(metaFile)) {
  key = JSON.parse(fs.readFileSync(metaFile, 'utf8')).key;
}
if (!key) {
  console.error('Usage: stage-mcp-args.mjs <key>  (or run apply.mjs next first)');
  process.exit(1);
}
fs.writeFileSync(metaFile, JSON.stringify({ key }), 'utf8');
fs.writeFileSync(argsFile, JSON.stringify({ key, query }), 'utf8');
console.log(JSON.stringify({ key, bytes: query.length, argsFile, sqlFile }));
