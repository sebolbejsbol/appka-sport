// Konwertuje logo (zapisane jako JPEG z rozszerzeniem .png) na prawdziwy PNG.
// Uruchom: node scripts/fix-logo-png.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'pngjs';
import jpeg from 'jpeg-js';

const { PNG } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, '..', 'assets', 'images', 'dudieday-logo.png');

const buf = readFileSync(target);
if (!buf.subarray(0, 4).toString('hex').startsWith('ffd8ff')) {
  console.log('Już PNG — nic nie robię.');
  process.exit(0);
}

const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
const png = new PNG({ width: img.width, height: img.height });
png.data = Buffer.from(img.data);
writeFileSync(target, PNG.sync.write(png));
console.log(`OK -> prawdziwy PNG ${img.width}x${img.height}`);
