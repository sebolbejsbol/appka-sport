#!/usr/bin/env node
/** Mark multiple chunks. Usage: node mark-batch.mjs 02-02 02-03 ... */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const apply = path.join(root, 'scripts/basketball-upload/apply.mjs');
const keys = process.argv.slice(2);
if (!keys.length) process.exit(1);
const r = spawnSync(process.execPath, [apply, 'mark', ...keys], { cwd: root, encoding: 'utf8' });
process.stdout.write(r.stdout);
if (r.status) process.exit(r.status);
