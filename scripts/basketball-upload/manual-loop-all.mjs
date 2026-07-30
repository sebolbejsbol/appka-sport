#!/usr/bin/env node
/**
 * Run manual upload loop: apply.mjs next -> MCP execute_sql via HTTP -> mark/fail.
 * Uses same MCP endpoint as upload-loop.mjs; token from env or .env.local.
 */
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
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
}
loadEnv();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gjkbnkaijlempveotnui';
const MCP_URL = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
const token = process.env.SUPABASE_ACCESS_TOKEN;

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
    return json.result?.content?.[0]?.text || 'ok';
  }
  if (/error/i.test(body)) throw new Error(body.slice(0, 500));
  return 'ok';
}

function mark(k) {
  spawnSync(process.execPath, [apply, 'mark', k], { cwd: root, encoding: 'utf8' });
}
function fail(k) {
  spawnSync(process.execPath, [apply, 'fail', k], { cwd: root, encoding: 'utf8' });
}

async function main() {
  if (!token) {
    console.log(JSON.stringify({ blocked: true, reason: 'SUPABASE_ACCESS_TOKEN missing' }));
    process.exit(2);
  }

  let sessionId = null;
  const results = { ok: [], failed: [] };

  while (true) {
    const r = spawnSync(process.execPath, [apply, 'next'], { cwd: root, encoding: 'utf8' });
    const meta = JSON.parse(r.stdout.trim());
    if (meta.done) break;
    const sql = fs.readFileSync(meta.sqlFile, 'utf8');
    const k = meta.key;
    try {
      const resp = await mcpCall('execute_sql', { query: sql }, sessionId);
      sessionId = resp.sessionId || sessionId;
      if (resp.status >= 400) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0, 200)}`);
      parseResult(resp.body);
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
