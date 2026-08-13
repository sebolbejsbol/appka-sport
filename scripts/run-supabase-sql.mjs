#!/usr/bin/env node
/**
 * Runs a .sql file against this project's Supabase database via the
 * Management API — same effect as pasting it into the SQL Editor.
 * Usage: node scripts/run-supabase-sql.mjs <path-to-sql-file>
 * Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadEnv() {
  const envPath = path.join(root, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

async function main() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('Usage: node scripts/run-supabase-sql.mjs <path-to-sql-file>');
    process.exit(1);
  }

  const env = loadEnv();
  const token = env.SUPABASE_ACCESS_TOKEN;
  const ref = env.SUPABASE_PROJECT_REF;
  if (!token || !ref) {
    console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env');
    process.exit(1);
  }

  const query = fs.readFileSync(path.resolve(sqlFile), 'utf8');

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Supabase API error (${res.status}):`, text);
    process.exit(1);
  }

  console.log('OK');
  console.log(text);
}

main();
