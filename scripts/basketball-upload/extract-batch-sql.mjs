#!/usr/bin/env node
import fs from 'node:fs';
import { abs } from './lib/paths.mjs';

const dir = abs('scripts/.cache/_mcp-batch');
const keys = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const { key, query } = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  fs.writeFileSync(`${dir}/${key}.sql`, query);
  keys.push(key);
}
keys.sort();
console.log(JSON.stringify({ keys }));
