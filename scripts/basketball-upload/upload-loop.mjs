#!/usr/bin/env node
/**
 * Automated basketball upload loop via Supabase MCP HTTP.
 * Requires SUPABASE_ACCESS_TOKEN in .env (Personal Access Token).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load } from './lib/progress.mjs';
import { createMcpClient } from './lib/mcp-http.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gjkbnkaijlempveotnui';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
const token = process.env.SUPABASE_ACCESS_TOKEN;

function mark(k) {
  spawnSync(process.execPath, [apply, 'mark', k], { cwd: root, encoding: 'utf8' });
}
function fail(k) {
  spawnSync(process.execPath, [apply, 'fail', k], { cwd: root, encoding: 'utf8' });
}

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

async function main() {
  if (!token) {
    console.log(JSON.stringify({ blocked: true, reason: 'SUPABASE_ACCESS_TOKEN missing' }));
    process.exit(2);
  }

  const mcp = await createMcpClient({ url: MCP_URL, token });
  const results = { ok: [], failed: [] };

  for (const c of pending()) {
    const k = key(c.part, c.chunk);
    const sql = readSql(c.part, c.chunk);
    try {
      await mcp.callTool('execute_sql', { query: sql });
      mark(k);
      results.ok.push(k);
      console.log(`OK ${k}`);
    } catch (e) {
      fail(k);
      results.failed.push({ key: k, error: String(e.message || e) });
      console.error(`FAIL ${k}: ${e.message || e}`);
    }
  }

  console.log(JSON.stringify(results));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
