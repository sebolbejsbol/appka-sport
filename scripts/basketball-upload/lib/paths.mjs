import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '../../..');
export const CHUNKS = '.tmp-0049-parts/chunks';
export const PROGRESS = 'scripts/.cache/basketball-upload.json';

export function abs(rel) {
  return join(ROOT, rel);
}
