import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { abs, PROGRESS } from './paths.mjs';

export function load() {
  const path = abs(PROGRESS);
  if (!existsSync(path)) return { completed: [], failed: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function save(data) {
  const path = abs(PROGRESS);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}
