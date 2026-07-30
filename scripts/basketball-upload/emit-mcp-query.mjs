#!/usr/bin/env node
/** Emit MCP execute_sql args JSON to stdout from staged _current-query.sql */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const query = fs.readFileSync(path.join(root, 'scripts/.cache/_current-query.sql'), 'utf8');
process.stdout.write(JSON.stringify({ query }));
