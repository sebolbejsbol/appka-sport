#!/usr/bin/env node
/** Prepare MCP call args for part N. Usage: node prepare-mcp-call.mjs <N> */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const part = Number(process.argv[2]);
const nn = String(part).padStart(2, '0');

if (!part) {
  console.error('Usage: prepare-mcp-call.mjs <N>');
  process.exit(1);
}

const migrationName = `osm_basketball_poland_part_${nn}`;
const applyPath = path.join(partsDir, `_apply-${nn}.json`);
const sqlPath = path.join(partsDir, `q-${nn}.sql`);

let tool, args;
if (part <= 5) {
  const query = fs.readFileSync(sqlPath, 'utf8');
  tool = 'execute_sql';
  args = { query };
} else {
  const payload = JSON.parse(fs.readFileSync(applyPath, 'utf8'));
  tool = 'apply_migration';
  args = { name: payload.name, query: payload.query };
}

const out = { part, tool, args, queryLen: args.query.length, migrationName };
const outPath = path.join(partsDir, '_mcp-next-call.json');
fs.writeFileSync(outPath, JSON.stringify(out), 'utf8');
process.stdout.write(JSON.stringify({ part, tool, queryLen: args.query.length, outPath }));
