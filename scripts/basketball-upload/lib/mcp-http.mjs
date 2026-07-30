import https from 'node:https';

function sessionHeaders(sessionId) {
  if (!sessionId) return {};
  return { 'Mcp-Session-Id': sessionId };
}

function pickSessionId(res) {
  const h = res.headers;
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (key === 'mcp-session-id' || key === 'x-supabase-id' || key === 'x-mcp-session-id') {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return null;
}

function isSessionError(msg) {
  return /session-?id|supabase-?id/i.test(msg);
}

function post(url, token, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const reqHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: `Bearer ${token}`,
      ...headers,
    };
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: reqHeaders },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export function parseMcpBody(body) {
  for (const line of body.split('\n').filter(Boolean)) {
    if (!line.startsWith('data:')) continue;
    const json = JSON.parse(line.slice(5).trim());
    if (json.error) throw new Error(JSON.stringify(json.error));
    if (json.result?.isError) throw new Error(json.result.content?.[0]?.text || 'MCP error');
    if (json.result?.content?.[0]?.text) return json.result.content[0].text;
    if (json.result !== undefined) return json.result;
  }
  if (body.trim().startsWith('{')) {
    const json = JSON.parse(body);
    if (json.error) throw new Error(JSON.stringify(json.error));
    if (json.result !== undefined) return json.result;
  }
  if (/error/i.test(body)) throw new Error(body.slice(0, 500));
  return body.slice(0, 500);
}

export async function createMcpClient({ url, token }) {
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN missing');

  let sessionId = null;
  let reqId = 1;

  async function rpc(method, params, { notification = false } = {}) {
    const body = notification
      ? { jsonrpc: '2.0', method, params }
      : { jsonrpc: '2.0', id: reqId++, method, params };
    const resp = await post(url, token, sessionHeaders(sessionId), body);
    sessionId = pickSessionId(resp) || sessionId;
    if (resp.status >= 400) throw new Error(`HTTP ${resp.status}: ${resp.body.slice(0, 300)}`);
    return notification ? null : parseMcpBody(resp.body);
  }

  async function initSession() {
    sessionId = null;
    const initResp = await post(
      url,
      token,
      {},
      {
        jsonrpc: '2.0',
        id: reqId++,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'appka-sport-upload', version: '1.0.0' },
        },
      },
    );
    sessionId = pickSessionId(initResp) || sessionId;
    if (initResp.status >= 400) {
      throw new Error(`MCP initialize failed HTTP ${initResp.status}: ${initResp.body.slice(0, 300)}`);
    }
    parseMcpBody(initResp.body);
    if (!sessionId) {
      throw new Error(
        `MCP initialize OK but no session id in response headers (${Object.keys(initResp.headers).join(', ')})`,
      );
    }
    await rpc('notifications/initialized', {}, { notification: true });
  }

  await initSession();

  return {
    async callTool(name, args) {
      try {
        return await rpc('tools/call', { name, arguments: args });
      } catch (e) {
        const msg = String(e.message || e);
        if (!isSessionError(msg)) throw e;
        await initSession();
        return rpc('tools/call', { name, arguments: args });
      }
    },
  };
}
