/**
 * Generuje ikony aplikacji (launcher, adaptive Android, favicon) z logo DUDIE DAY
 * na lekkim błękitnym tle. Uruchom: node scripts/generate-app-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import pkg from 'pngjs';

const { PNG } = pkg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'images');
const LOGO_PATH = join(OUT_DIR, 'dudieday-logo.png');

/** Lekki błękit — spójny z adaptiveIcon.backgroundColor w app.json. */
const BG = { r: 230, g: 244, b: 254, a: 255 };
const WHITE = { r: 255, g: 255, b: 255, a: 255 };

/** Proporcje logo po przycięciu czarnych marginesów (752×509 px). */
const LOGO_ASPECT = 752 / 509;

function decodeLogo(path) {
  const buf = readFileSync(path);
  if (buf.subarray(0, 4).toString('hex').startsWith('ffd8ff')) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    return { width: img.width, height: img.height, data: img.data };
  }
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data };
}

function isBackground(r, g, b, a) {
  if (a < 16) return true;
  return r < 40 && g < 40 && b < 40;
}

function cropToContent(logo) {
  let minX = logo.width;
  let minY = logo.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < logo.height; y++) {
    for (let x = 0; x < logo.width; x++) {
      const i = (y * logo.width + x) * 4;
      if (isBackground(logo.data[i], logo.data[i + 1], logo.data[i + 2], logo.data[i + 3])) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((minY + y) * logo.width + (minX + x)) * 4;
      const di = (y * w + x) * 4;
      data[di] = logo.data[si];
      data[di + 1] = logo.data[si + 1];
      data[di + 2] = logo.data[si + 2];
      data[di + 3] = logo.data[si + 3];
    }
  }
  return { width: w, height: h, data };
}

function scaleLogo(logo, maxW, maxH) {
  const scale = Math.min(maxW / logo.width, maxH / logo.height);
  const w = Math.round(logo.width * scale);
  const h = Math.round(logo.height * scale);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(logo.width - 1, Math.floor((x / w) * logo.width));
      const sy = Math.min(logo.height - 1, Math.floor((y / h) * logo.height));
      const si = (sy * logo.width + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = logo.data[si];
      out[di + 1] = logo.data[si + 1];
      out[di + 2] = logo.data[si + 2];
      out[di + 3] = logo.data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

function createCanvas(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = BG.r;
    data[i * 4 + 1] = BG.g;
    data[i * 4 + 2] = BG.b;
    data[i * 4 + 3] = BG.a;
  }
  return { width: size, height: size, data };
}

function solidCanvas(size, color) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = color.r;
    data[i * 4 + 1] = color.g;
    data[i * 4 + 2] = color.b;
    data[i * 4 + 3] = color.a;
  }
  return { width: size, height: size, data };
}

function transparentCanvas(size) {
  return { width: size, height: size, data: new Uint8Array(size * size * 4) };
}

function blit(dest, src, offsetX, offsetY, { skipBackground = false, forceOpaque = false } = {}) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const dx = offsetX + x;
      const dy = offsetY + y;
      if (dx < 0 || dy < 0 || dx >= dest.width || dy >= dest.height) continue;
      const si = (y * src.width + x) * 4;
      const r = src.data[si];
      const g = src.data[si + 1];
      const b = src.data[si + 2];
      const a = src.data[si + 3];
      if (skipBackground && isBackground(r, g, b, a)) continue;
      const di = (dy * dest.width + dx) * 4;
      dest.data[di] = r;
      dest.data[di + 1] = g;
      dest.data[di + 2] = b;
      dest.data[di + 3] = forceOpaque ? 255 : a;
    }
  }
}

function writePng(canvas, filename) {
  const png = new PNG({ width: canvas.width, height: canvas.height });
  png.data = Buffer.from(canvas.data);
  writeFileSync(join(OUT_DIR, filename), PNG.sync.write(png));
}

function buildIcon(size, marginRatio, bg = BG) {
  const canvas = solidCanvas(size, bg);
  const pad = Math.round(size * marginRatio);
  const scaled = scaleLogo(logo, size - pad * 2, size - pad * 2);
  const ox = Math.round((size - scaled.width) / 2);
  const oy = Math.round((size - scaled.height) / 2);
  blit(canvas, scaled, ox, oy, { skipBackground: true, forceOpaque: true });
  return canvas;
}

function buildForeground(size, marginRatio) {
  const canvas = transparentCanvas(size);
  const pad = Math.round(size * marginRatio);
  const scaled = scaleLogo(logo, size - pad * 2, size - pad * 2);
  const ox = Math.round((size - scaled.width) / 2);
  const oy = Math.round((size - scaled.height) / 2);
  blit(canvas, scaled, ox, oy, { skipBackground: true });
  return canvas;
}

function buildMonochrome(size, marginRatio) {
  const canvas = transparentCanvas(size);
  const pad = Math.round(size * marginRatio);
  const scaled = scaleLogo(logo, size - pad * 2, size - pad * 2);
  const ox = Math.round((size - scaled.width) / 2);
  const oy = Math.round((size - scaled.height) / 2);
  for (let y = 0; y < scaled.height; y++) {
    for (let x = 0; x < scaled.width; x++) {
      const si = (y * scaled.width + x) * 4;
      const r = scaled.data[si];
      const g = scaled.data[si + 1];
      const b = scaled.data[si + 2];
      const a = scaled.data[si + 3];
      if (isBackground(r, g, b, a)) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue;
      const di = (dy * size + dx) * 4;
      canvas.data[di] = 31;
      canvas.data[di + 1] = 41;
      canvas.data[di + 2] = 55;
      canvas.data[di + 3] = 255;
    }
  }
  return canvas;
}

const rawLogo = decodeLogo(LOGO_PATH);
const logo = cropToContent(rawLogo);

// marginRatio = odstęp od krawędzi (logo mieści się w środku bez ucinania).
// Adaptive Android maskuje ikonę do koła (~66% bezpieczna strefa) — większy margines.
const ICON_MARGIN = 0.14;
const ADAPTIVE_MARGIN = 0.19;
const SPLASH_MARGIN = 0.13;

writePng(buildIcon(1024, ICON_MARGIN, BG), 'icon.png');
writePng(buildForeground(1024, ADAPTIVE_MARGIN), 'android-icon-foreground.png');
writePng(solidCanvas(1024, BG), 'android-icon-background.png');
writePng(buildMonochrome(1024, ICON_MARGIN), 'android-icon-monochrome.png');
writePng(buildIcon(48, ICON_MARGIN, BG), 'favicon.png');
writePng(buildIcon(1024, SPLASH_MARGIN, WHITE), 'splash-logo.png');

console.log('Wygenerowano ikony aplikacji w assets/images/');
