#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const query = fs.readFileSync(path.join(root, 'scripts/.cache/_current-query.sql'), 'utf8');
const status = JSON.parse(fs.readFileSync(path.join(root, 'scripts/.cache/_mcp-loop-status.json'), 'utf8'));
const out = path.join(root, 'scripts/.cache/_mcp-args.json');
fs.writeFileSync(out, JSON.stringify({ key: status.key, query }));
console.log(JSON.stringify({ key: status.key, bytes: query.length, argsFile: out }));
