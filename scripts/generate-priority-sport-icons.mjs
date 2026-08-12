// Regenerates the 4 "priority" sport marker icons (basketball, football,
// tennis, volleyball) used both for individual map pins and for the
// per-sport mini-icons inside map clusters. Uses the system emoji/symbol
// font's monochrome fallback glyph (resvg doesn't render color emoji, but
// the fallback outline glyphs are real, detailed sport pictograms) in white
// on a solid brand-color circle — much more recognizable at small marker
// sizes than the old white-dot + thin-ring + hand-drawn-line-art look.
// Run: node scripts/generate-priority-sport-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'assets', 'map-field-icons');

const SIZE = 108; // 36 * 3 (@3x, matches FIELD_ICON_SCALE=3 in map-field-icons.ts)

// key -> [kolor tła, emoji (resvg renderuje mono glif zamiast kolorowego)]
const ICONS = {
  basketball: ['#f97316', '🏀'],
  football: ['#22c55e', '⚽'],
  tennis: ['#eab308', '🎾'],
  volleyball: ['#06b6d4', '🏐'],
};

function svgFor(bg, emoji) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">
    <ellipse cx="50" cy="53" rx="42" ry="41" fill="rgba(15,23,42,0.22)"/>
    <circle cx="50" cy="50" r="42" fill="${bg}" stroke="#ffffff" stroke-width="4"/>
    <text x="50" y="69" font-size="56" text-anchor="middle" fill="#ffffff">${emoji}</text>
  </svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, [bg, emoji]] of Object.entries(ICONS)) {
  const resvg = new Resvg(svgFor(bg, emoji), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `${key}.png`), png);
}

console.log(`Wygenerowano ${Object.keys(ICONS).length} ikon w ${OUT_DIR}`);
