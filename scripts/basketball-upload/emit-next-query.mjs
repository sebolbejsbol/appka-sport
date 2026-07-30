#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const sql = fs.readFileSync(path.join(root, 'scripts/.cache/_basketball-next.sql'), 'utf8');
const out = path.join(root, 'scripts/.cache/_emit-utf8.json');
fs.writeFileSync(out, JSON.stringify({ query: sql }), 'utf8');
console.log(JSON.stringify({ bytes: sql.length, file: out }));
