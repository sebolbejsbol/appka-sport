#!/usr/bin/env node
/**
 * Apply all 0049 parts 2-33 via Supabase MCP HTTP.
 * Loads .env internally. Falls back exit 2 if no token.
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const progressScript = path.join(partsDir, 'mark-part.mjs');

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gjkbnkaijlempveotnui';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
const token = process.env.SUPABASE_ACCESS_TOKEN;

const start = Number(process.argv[2] || 2);
const end = Number(process.argv[3] || 33);

const registeredBackfill = new Set([
  'osm_basketball_poland_part_01',
  'osm_basketball_poland_part_02',
  'osm_basketball_poland_part_03',
  'osm_basketball_poland_part_04',
  'osm_basketball_poland_part_05',
]);

function mcpCall(toolName, toolArgs, sessionId) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: toolName, arguments: toolArgs },
  });
  return new Promise((resolve, reject) => {
    const url = new URL(MCP_URL);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(body),
    };
    if (!token) return reject(new Error('SUPABASE_ACCESS_TOKEN missing'));
    headers.Authorization = `Bearer ${token}`;
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: data, sessionId: res.headers['mcp-session-id'] }),
        );
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseResult(body) {
  for (const line of body.split('\n').filter(Boolean)) {
    if (!line.startsWith('data:')) continue;
    const json = JSON.parse(line.slice(5).trim());
    if (json.error) throw new Error(JSON.stringify(json.error));
    if (json.result?.isError) throw new Error(json.result.content?.[0]?.text || 'MCP error');
    if (json.result?.content?.[0]?.text) return json.result.content[0].text;
  }
  return body.slice(0, 500);
}

function mark(part) {
  spawnSync(process.execPath, [progressScript, String(part)], { cwd: root, encoding: 'utf8' });
}

async function main() {
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN missing');
    process.exit(2);
  }

  let sessionId = null;
  const results = { backfilled: [], applied: [], skipped: [], failed: [], errors: [] };

  const listResp = await mcpCall('list_migrations', {}, sessionId);
  sessionId = listResp.sessionId || sessionId;
  const existing = new Set(JSON.parse(parseResult(listResp.body)).map((m) => m.name));

  for (let part = start; part <= end; part++) {
    const nn = String(part).padStart(2, '0');
    const migrationName = `osm_basketball_poland_part_${nn}`;
    const payload = JSON.parse(fs.readFileSync(path.join(partsDir, `_mcp-apply-${nn}.json`), 'utf8'));

    try {
      if (part <= 5 && registeredBackfill.has(migrationName)) {
        const resp = await mcpCall('execute_sql', { query: payload.query }, sessionId);
        sessionId = resp.sessionId || sessionId;
        parseResult(resp.body);
        mark(part);
        results.backfilled.push({ part, name: migrationName });
        console.log(`BACKFILL ${part}`);
      } else if (existing.has(migrationName)) {
        mark(part);
        results.skipped.push({ part, name: migrationName });
        console.log(`SKIP ${part}`);
      } else {
        const resp = await mcpCall(
          'apply_migration',
          { name: payload.name, query: payload.query },
          sessionId,
        );
        sessionId = resp.sessionId || sessionId;
        parseResult(resp.body);
        mark(part);
        existing.add(migrationName);
        results.applied.push({ part, name: payload.name });
        console.log(`APPLY ${part}`);
      }
    } catch (e) {
      results.failed.push({ part, name: migrationName });
      results.errors.push({ part, error: String(e.message || e) });
      console.error(`FAIL ${part}: ${e.message || e}`);
      break;
    }
  }

  fs.writeFileSync(path.join(partsDir, 'batch-results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
