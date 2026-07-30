#!/usr/bin/env node
/**
 * Read SQL/JSON payload and invoke execute_sql or apply_migration via file path.
 * Agent workflow: node scripts/mcp-run-from-json.mjs exec _exec-args.json
 * Then agent reads result from stdout.
 *
 * This script uses dynamic import of query from JSON file and prints
 * instructions for CallMcpTool - OR uses pg if DATABASE_URL set.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.argv[2]; // exec | apply
const fileArg = process.argv[3];

if (!mode || !fileArg) {
  console.error('Usage: mcp-run-from-json.mjs exec|apply <json-file>');
  process.exit(1);
}

const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(root, fileArg);
const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const out = {
  tool: mode === 'apply' ? 'apply_migration' : 'execute_sql',
  args: mode === 'apply' ? { name: payload.name, query: payload.query } : { query: payload.query },
  queryLen: payload.query?.length,
};
process.stdout.write(JSON.stringify(out));
