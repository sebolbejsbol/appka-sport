#!/usr/bin/env node
/**
 * Loop parts 4-33: list_migrations check, apply_migration via MCP HTTP.
 * Uses CallMcpTool-compatible flow: reads _apply-NN.json, calls apply_migration.
 * Requires SUPABASE_ACCESS_TOKEN in .env for HTTP MCP.
 *
 * When token missing, prints part list for manual CallMcpTool apply.
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partsDir = path.join(root, '.tmp-0049-parts');
const progressScript = path.join(root, 'scripts', 'apply-0049-parts.mjs');

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

const start = Number(process.argv[2] || 4);
const end = Number(process.argv[3] || 33);

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

function mark(n) {
  spawnSync(process.execPath, [progressScript, 'mark', String(n)], { cwd: root, encoding: 'utf8' });
}
function fail(n) {
  spawnSync(process.execPath, [progressScript, 'fail', String(n)], { cwd: root, encoding: 'utf8' });
}

async function main() {
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN missing — use CallMcpTool apply_migration per part');
    process.exit(2);
  }

  let sessionId = null;
  const results = { applied: [], skipped: [], failed: [], errors: [] };

  const listResp = await mcpCall('list_migrations', {}, sessionId);
  sessionId = listResp.sessionId || sessionId;
  const existing = new Set(JSON.parse(parseResult(listResp.body)).migrations.map((m) => m.name));

  for (let part = start; part <= end; part++) {
    const nn = String(part).padStart(2, '0');
    const name = `osm_basketball_poland_part_${nn}`;

    if (existing.has(name)) {
      mark(part);
      results.skipped.push({ part, name });
      console.log(`SKIP ${part}`);
      continue;
    }

    const { name: migrationName, query } = JSON.parse(
      fs.readFileSync(path.join(partsDir, `_apply-${nn}.json`), 'utf8'),
    );

    try {
      const resp = await mcpCall('apply_migration', { name: migrationName, query }, sessionId);
      sessionId = resp.sessionId || sessionId;
      parseResult(resp.body);
      mark(part);
      existing.add(name);
      results.applied.push({ part, name: migrationName });
      console.log(`OK ${part}`);
    } catch (e) {
      fail(part);
      results.failed.push({ part, name: migrationName });
      results.errors.push({ part, error: String(e.message || e) });
      console.error(`FAIL ${part}: ${e.message || e}`);
    }
  }

  fs.writeFileSync(path.join(partsDir, 'batch-results-4-33.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
