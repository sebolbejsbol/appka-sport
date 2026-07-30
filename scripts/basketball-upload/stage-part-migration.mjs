#!/usr/bin/env node
/**
 * Stage part migration SQL for MCP apply_migration.
 * Usage: node stage-part-migration.mjs 18
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const part = Number(process.argv[2]);
const nn = String(part).padStart(2, '0');
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const sqlPath = path.join(root, `supabase/migrations/parts/0049/0049_part_${nn}.sql`);
const cache = path.join(root, 'scripts/.cache');
const sql = readFileSync(sqlPath, 'utf8');
const name = `osm_basketball_poland_part_${nn}`;
const keys = [1, 2, 3, 4, 5].map((c) => `${nn}-${String(c).padStart(2, '0')}`);
writeFileSync(path.join(cache, '_exec-query.txt'), sql, 'utf8');
writeFileSync(path.join(cache, '_migration-name.txt'), name, 'utf8');
writeFileSync(path.join(cache, '_exec-key.txt'), keys.join(','), 'utf8');
writeFileSync(path.join(cache, '_mcp-call-args.json'), JSON.stringify({ name, query: sql }), 'utf8');
console.log(JSON.stringify({ part, name, keys, bytes: sql.length, sqlPath }));
