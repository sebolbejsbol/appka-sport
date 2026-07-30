/**
 * Wierne odtworzenie: sekwencyjne odtworzenie WSZYSTKICH operacji plikowych
 * (Write/StrReplace/Delete) w kolejności z transkryptu — tak jak działał edytor.
 *
 * Użycie:
 *   node scripts/recover-v2.mjs            -> DRY RUN (tylko raport, nic nie zapisuje)
 *   node scripts/recover-v2.mjs --write    -> zapis do .recover-v2/ (do inspekcji)
 *   node scripts/recover-v2.mjs --apply    -> zapis bezpośrednio do repo (src/, itd.)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TRANSCRIPT_DIR =
  'C:/Users/Admin/.cursor/projects/d-appka-sport/agent-transcripts/911399a2-a4f1-4082-9765-14e5833e588a';
const MAIN = join(TRANSCRIPT_DIR, '911399a2-a4f1-4082-9765-14e5833e588a.jsonl');

const MODE = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--write')
    ? 'write'
    : 'dry';

function shouldRecover(rel) {
  if (!rel) return false;
  if (rel.startsWith('src/')) return true;
  if (rel === 'app.json' || rel === 'eas.json' || rel === '.env.example') return true;
  if (rel.startsWith('supabase/migrations/')) return true;
  if (rel.startsWith('supabase/sql-snippets/')) return true;
  if (rel.startsWith('pomysl/')) return true;
  if (rel.startsWith('assets/') && !rel.includes('map-badges')) return false; // binarne pomijamy
  return false;
}

function normalizePath(p) {
  if (typeof p !== 'string') return null;
  const norm = p.replace(/\\/g, '/');
  const idx = norm.toLowerCase().indexOf('appka-sport/');
  if (idx === -1) return null;
  return norm.slice(idx + 'appka-sport/'.length);
}

function collectOps(file) {
  const out = [];
  const raw = readFileSync(file, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.role !== 'assistant') continue;
    const blocks = obj.message?.content;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block.type !== 'tool_use') continue;
      const rel = normalizePath(block.input?.path);
      if (!shouldRecover(rel)) continue;
      out.push({ name: block.name, rel, input: block.input });
    }
  }
  return out;
}

const ops = collectOps(MAIN);

// Edytor zapisywał na dysku z CRLF, a Write modelu miał LF — normalizujemy
// wszystko do LF, żeby późniejsze StrReplace (pobrane z dysku w CRLF) pasowały.
const lf = (s) => (typeof s === 'string' ? s.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : s);

const files = new Map();
let writes = 0;
let strOk = 0;
let fuzzyOk = 0;
const failures = [];

for (let i = 0; i < ops.length; i++) {
  const op = ops[i];
  if (op.name === 'Write') {
    const text = op.input.contents ?? op.input.content;
    if (typeof text === 'string') {
      files.set(op.rel, lf(text));
      writes++;
    }
  } else if (op.name === 'Delete') {
    files.delete(op.rel);
  } else if (op.name === 'StrReplace') {
    const o = lf(op.input.old_string);
    const n = lf(op.input.new_string);
    const all = op.input.replace_all;
    if (typeof o !== 'string' || typeof n !== 'string') continue;
    const cur = files.get(op.rel);
    if (cur === undefined) {
      failures.push({ rel: op.rel, i, reason: 'no base file' });
      continue;
    }
    if (cur.includes(o)) {
      files.set(op.rel, all ? cur.split(o).join(n) : cur.replace(o, n));
      strOk++;
      continue;
    }
    // Fallback: dopasowanie tolerujące białe znaki (formatter mógł przeformatować).
    const escaped = o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    let re;
    try {
      re = new RegExp(escaped, 'g');
    } catch {
      re = null;
    }
    if (re) {
      const matches = cur.match(re);
      if (matches && matches.length === 1) {
        files.set(op.rel, cur.replace(re, () => n));
        strOk++;
        fuzzyOk++;
        continue;
      }
    }
    failures.push({ rel: op.rel, i, reason: 'old_string not found' });
  }
}

const srcFailures = failures.filter((f) => f.rel.startsWith('src/'));
const failByFile = new Map();
for (const f of srcFailures) failByFile.set(f.rel, (failByFile.get(f.rel) ?? 0) + 1);

console.log('MODE:', MODE);
console.log('ops:', ops.length, 'writes:', writes, 'strOk:', strOk, '(fuzzy:', fuzzyOk + ')', 'failures:', failures.length);
console.log('final files:', files.size);
console.log('src/ files with failed StrReplace:', failByFile.size);
for (const [rel, c] of [...failByFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('  ' + c + '  ' + rel);
}

if (MODE === 'dry') {
  console.log('\n(DRY RUN — nic nie zapisano. Użyj --write lub --apply.)');
} else {
  const outRoot = MODE === 'apply' ? ROOT : join(ROOT, '.recover-v2');
  if (MODE === 'write' && existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
  let written = 0;
  for (const [rel, content] of files) {
    const full = join(outRoot, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
    written++;
  }
  console.log('\nwritten:', written, 'to', outRoot);
}
