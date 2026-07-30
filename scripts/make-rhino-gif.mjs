// Generuje animowany GIF (crossfade) z dwóch grafik nosorożca DUDIE DAY.
// Uruchom: node scripts/make-rhino-gif.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pkg from 'pngjs';
import jpeg from 'jpeg-js';
import gifenc from 'gifenc';

const { PNG } = pkg;
const { GIFEncoder, quantize, applyPalette } = gifenc;
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SRC_A = join(root, 'assets', 'branding', 'rhino-green.png');
const SRC_B = join(root, 'assets', 'branding', 'rhino-red.png');
const OUT = join(root, 'assets', 'branding', 'dudieday-rhino.gif');

const SIZE = 420; // docelowy rozmiar GIF-a (kwadrat)
const HOLD = 5; // ile klatek trzymać każdy kolor
const FADE = 7; // ile klatek crossfade między kolorami
const DELAY = 70; // ms na klatkę

/** Dekoduje obraz (JPEG lub PNG, niezależnie od rozszerzenia) do RGBA. */
function readRGBA(path) {
  const buf = readFileSync(path);
  const sig = buf.subarray(0, 4).toString('hex');
  if (sig.startsWith('ffd8ff')) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: img.data };
  }
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

/** Box-downscale RGBA do SIZE x SIZE (uśrednianie pikseli). */
function downscale(src, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const sx = src.width / size;
  const sy = src.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(src.height, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(src.width, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      const o = (y * size + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Liniowy crossfade dwóch buforów RGBA (t: 0 -> A, 1 -> B). */
function blend(a, b, t) {
  const out = new Uint8ClampedArray(a.length);
  const inv = 1 - t;
  for (let i = 0; i < a.length; i += 4) {
    out[i] = a[i] * inv + b[i] * t;
    out[i + 1] = a[i + 1] * inv + b[i + 1] * t;
    out[i + 2] = a[i + 2] * inv + b[i + 2] * t;
    out[i + 3] = 255;
  }
  return out;
}

const A = downscale(readRGBA(SRC_A), SIZE);
const B = downscale(readRGBA(SRC_B), SIZE);

// Klatki: trzymaj A -> fade A→B -> trzymaj B -> fade B→A (pętla)
const frames = [];
for (let i = 0; i < HOLD; i++) frames.push(A);
for (let i = 1; i <= FADE; i++) frames.push(blend(A, B, i / (FADE + 1)));
for (let i = 0; i < HOLD; i++) frames.push(B);
for (let i = 1; i <= FADE; i++) frames.push(blend(B, A, i / (FADE + 1)));

// Globalna paleta z obu obrazów — mniej migotania kolorów między klatkami.
const sample = new Uint8ClampedArray(A.length + B.length);
sample.set(A, 0);
sample.set(B, A.length);
const palette = quantize(sample, 256, { format: 'rgb565' });

const gif = GIFEncoder();
for (const frame of frames) {
  const index = applyPalette(frame, palette, 'rgb565');
  gif.writeFrame(index, SIZE, SIZE, { palette, delay: DELAY });
}
gif.finish();

writeFileSync(OUT, gif.bytes());
console.log(`OK -> ${OUT} (${frames.length} klatek, ${SIZE}x${SIZE})`);
