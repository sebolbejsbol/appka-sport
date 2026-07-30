#!/usr/bin/env node
/**
 * Apply one 0049 part via Supabase MCP apply_migration.
 * Reads payload from .tmp-0049-parts/_apply-NN.json (UTF-8).
 * Agent: node scripts/mcp-apply-part.mjs <N> then CallMcpTool with printed path.
 *
 * This script prepares _mcp-current.json for CallMcpTool consumption.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const part = Number(process.argv[2]);
if (!part || part < 1 || part > 33) {
  console.error('Usage: node scripts/mcp-apply-part.mjs <1-33>');
  process.exit(1);
}
const nn = String(part).padStart(2, '0');
const src = path.join(root, '.tmp-0049-parts', `_apply-${nn}.json`);
const out = path.join(root, '.tmp-0049-parts', '_mcp-current.json');
const j = JSON.parse(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(out, JSON.stringify({ name: j.name, query: j.query }), 'utf8');
console.log(JSON.stringify({ part, name: j.name, queryLen: j.query.length, file: out }));
