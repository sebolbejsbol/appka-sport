#!/usr/bin/env node
/**
 * Upload boisk koszykówki (0049) — śledzenie postępu chunków.
 *
 *   node scripts/basketball-upload/apply.mjs status
 *   node scripts/basketball-upload/apply.mjs next          # meta następnego chunka
 *   node scripts/basketball-upload/apply.mjs sql 1 1         # SQL na stdout
 *   node scripts/basketball-upload/apply.mjs mark 01-01    # oznacz wgrany
 *   node scripts/basketball-upload/apply.mjs reset           # zacznij od zera (tylko plik postępu)
 */
import { writeFileSync } from 'node:fs';
import { abs } from './lib/paths.mjs';
import { allChunks, key, readSql } from './lib/chunks.mjs';
import { load, save } from './lib/progress.mjs';

const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

function pending() {
  const done = new Set(load().completed);
  return allChunks().filter((c) => !done.has(key(c.part, c.chunk)));
}

if (cmd === 'status') {
  const p = load();
  const total = allChunks().length;
  console.log(
    JSON.stringify({
      completed: p.completed.length,
      failed: p.failed?.length ?? 0,
      total,
      remaining: total - p.completed.length,
      rowsDone: p.completed.length * 100,
      rowsTotal: total * 100,
    }),
  );
} else if (cmd === 'reset') {
  save({ completed: [], failed: [], startedAt: new Date().toISOString() });
  console.log(JSON.stringify({ reset: true, total: allChunks().length }));
} else if (cmd === 'next') {
  const next = pending()[0];
  if (!next) {
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  const k = key(next.part, next.chunk);
  const sql = readSql(next.part, next.chunk);
  writeFileSync(abs('scripts/.cache/_basketball-next.sql'), sql, 'utf8');
  console.log(
    JSON.stringify({
      key: k,
      part: next.part,
      chunk: next.chunk,
      rows: next.rows,
      bytes: sql.length,
      sqlFile: abs('scripts/.cache/_basketball-next.sql'),
      markCmd: `node scripts/basketball-upload/apply.mjs mark ${k}`,
    }),
  );
} else if (cmd === 'sql' && arg1 && arg2) {
  process.stdout.write(readSql(Number(arg1), Number(arg2)));
} else if (cmd === 'mark') {
  const args = process.argv.slice(3);
  const keys =
    args.length === 2 && /^\d+$/.test(args[0]) && /^\d+$/.test(args[1])
      ? [key(Number(args[0]), Number(args[1]))]
      : args;
  if (!keys.length) {
    console.error('Usage: mark <01-01> [01-02 ...]  OR  mark <part> <chunk>');
    process.exit(1);
  }
  const p = load();
  for (const k of keys) {
    if (!p.completed.includes(k)) p.completed.push(k);
  }
  p.completed.sort();
  save(p);
  console.log(JSON.stringify({ marked: keys, completed: p.completed.length, total: allChunks().length }));
} else if (cmd === 'fail' && arg1) {
  const p = load();
  p.failed = p.failed ?? [];
  p.failed.push({ key: arg1, at: new Date().toISOString() });
  save(p);
  console.log(JSON.stringify({ failed: p.failed }));
} else {
  console.log('Usage: status|reset|next|sql <p> <c>|mark <keys...>|fail <key>');
  process.exit(1);
}
