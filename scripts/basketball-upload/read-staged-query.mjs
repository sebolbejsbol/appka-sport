#!/usr/bin/env node
/**
 * Agent helper: read staged query file and output MCP execute_sql args path.
 * Usage: node read-staged-query.mjs
 * Then CallMcpTool with JSON.parse(readFileSync(argsPath)).query
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const src = path.join(root, 'scripts/.cache/_mcp-query.json');
const argsPath = path.join(root, 'scripts/.cache/_mcp-call-args.json');
const data = JSON.parse(readFileSync(src, 'utf8'));
writeFileSync(argsPath, JSON.stringify({ query: data.query }), 'utf8');
console.log(JSON.stringify({ key: data.key, argsPath, bytes: data.query.length }));
