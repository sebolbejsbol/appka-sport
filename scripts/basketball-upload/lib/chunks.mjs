import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { abs, CHUNKS } from './paths.mjs';

export function key(part, chunk) {
  return `${String(part).padStart(2, '0')}-${String(chunk).padStart(2, '0')}`;
}

/** @returns {{ part: number, chunk: number, rows: number, bytes: number }[]} */
export function allChunks() {
  const list = [];
  for (let part = 1; part <= 33; part++) {
    const nn = String(part).padStart(2, '0');
    const manifestPath = abs(join(CHUNKS, nn, 'manifest.json'));
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    for (const c of manifest.chunks) {
      list.push({
        part,
        chunk: Number(c.name.match(/(\d+)/)[1]),
        rows: c.rows,
        bytes: c.bytes,
      });
    }
  }
  return list;
}

export function readSql(part, chunk) {
  const nn = String(part).padStart(2, '0');
  const file = `chunk-${String(chunk).padStart(2, '0')}.sql`;
  return readFileSync(abs(join(CHUNKS, nn, file)), 'utf8');
}
