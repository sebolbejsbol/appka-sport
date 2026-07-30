#!/usr/bin/env node
/**
 * Print next part to apply based on progress + list_migrations state.
 * Agent calls: node scripts/0049-next-part.mjs
 * Then: node scripts/prepare-mcp-call.mjs {N}
 * Then CallMcpTool with _mcp-next-call.json args
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const progressPath = path.join(root, 'scripts', '.cache', '0049-apply-progress.json');

let progress = { completed: [], failed: [] };
try {
  progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
} catch {}

const completed = new Set(progress.completed || []);
const failed = new Set(progress.failed || []);

for (let part = 2; part <= 33; part++) {
  if (failed.has(part)) continue;
  if (!completed.has(part)) {
    const nn = String(part).padStart(2, '0');
    const tool = part <= 5 ? 'execute_sql' : 'apply_migration';
    console.log(JSON.stringify({ part, tool, action: part <= 5 ? 'backfill' : 'apply_migration' }));
    process.exit(0);
  }
}

console.log(JSON.stringify({ done: true, completed: [...completed].sort((a, b) => a - b) }));
