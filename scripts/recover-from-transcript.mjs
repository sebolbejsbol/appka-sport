/**
 * Odtwarza pliki: ostatni Write + StrReplace tylko po nim (bez duplikatów).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TRANSCRIPT =
  'C:/Users/Admin/.cursor/projects/d-appka-sport/agent-transcripts/911399a2-a4f1-4082-9765-14e5833e588a/911399a2-a4f1-4082-9765-14e5833e588a.jsonl';

function shouldRecover(rel) {
  if (rel.startsWith('src/')) return true;
  if (rel === 'app.json' || rel === 'eas.json' || rel === '.env.example') return true;
  if (rel.startsWith('supabase/migrations/')) return true;
  if (rel.startsWith('pomysl/')) return true;
  return false;
}

function normalizePath(p) {
  const norm = p.replace(/\\/g, '/');
  const idx = norm.toLowerCase().indexOf('appka-sport/');
  if (idx === -1) return null;
  return norm.slice(idx + 'appka-sport/'.length);
}

const operations = [];
const raw = readFileSync(TRANSCRIPT, 'utf8');

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
    const { name, input } = block;
    if (!input?.path) continue;
    const rel = normalizePath(input.path);
    if (!rel || !shouldRecover(rel)) continue;
    operations.push({ name, rel, input });
  }
}

const deleted = new Set();
const lastWriteIdx = new Map();
const files = new Map();
const failed = [];

for (let i = 0; i < operations.length; i++) {
  const op = operations[i];
  if (op.name === 'Delete') {
    deleted.add(op.rel);
    lastWriteIdx.delete(op.rel);
    files.delete(op.rel);
  } else if (op.name === 'Write') {
    const text = op.input.contents ?? op.input.content;
    if (typeof text === 'string') {
      lastWriteIdx.set(op.rel, i);
      files.set(op.rel, text);
      deleted.delete(op.rel);
    }
  }
}

for (let i = 0; i < operations.length; i++) {
  const op = operations[i];
  if (op.name !== 'StrReplace' || deleted.has(op.rel)) continue;
  const baseIdx = lastWriteIdx.get(op.rel) ?? -1;
  if (i <= baseIdx) continue;

  let current = files.get(op.rel);
  if (current === undefined) continue;
  const { old_string: oldStr, new_string: newStr, replace_all: replaceAll } = op.input;
  if (typeof oldStr !== 'string' || typeof newStr !== 'string') continue;
  if (!current.includes(oldStr)) {
    failed.push({ rel: op.rel, i, reason: 'old_string not found' });
    continue;
  }
  files.set(
    op.rel,
    replaceAll ? current.split(oldStr).join(newStr) : current.replace(oldStr, newStr),
  );
}

const srcRoot = join(ROOT, 'src');
if (existsSync(srcRoot)) rmSync(srcRoot, { recursive: true, force: true });

let written = 0;
for (const [rel, content] of files) {
  if (deleted.has(rel)) continue;
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  written++;
}

console.log(JSON.stringify({ written, failed: failed.length }, null, 2));
