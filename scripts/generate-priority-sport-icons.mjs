// Regenerates the "priority" sport marker icons (basketball, football,
// tennis, volleyball, hockey) used both for individual map pins and for the
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
const EMOJI_ICONS = {
  basketball: ['#f97316', '🏀'],
  football: ['#22c55e', '⚽'],
  tennis: ['#eab308', '🎾'],
  volleyball: ['#06b6d4', '🏐'],
  hockey: ['#1d4ed8', '🏒'],
};

function shell(bg, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">
    <ellipse cx="50" cy="53" rx="42" ry="41" fill="rgba(15,23,42,0.22)"/>
    <circle cx="50" cy="50" r="42" fill="${bg}" stroke="#ffffff" stroke-width="4"/>
    ${glyph}
  </svg>`;
}

function svgFor(bg, emoji) {
  return shell(bg, `<text x="50" y="69" font-size="56" text-anchor="middle" fill="#ffffff">${emoji}</text>`);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, [bg, emoji]] of Object.entries(EMOJI_ICONS)) {
  const resvg = new Resvg(svgFor(bg, emoji), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `${key}.png`), png);
}

// Fitness/siłownia — emoji nie ma dobrego fallbacku (system renderuje sylwetkę
// człowieka, inny styl niż reszta), więc hantle rysujemy ręcznie: prosty,
// geometryczny kształt spójny z resztą rodziny ikon (brak figur ludzkich).
const FITNESS_SVG = shell(
  '#a855f7',
  `<g fill="#ffffff">
     <rect x="18" y="42" width="12" height="16" rx="3"/>
     <rect x="70" y="42" width="12" height="16" rx="3"/>
     <rect x="30" y="47" width="40" height="6" rx="3"/>
   </g>`,
);
{
  const resvg = new Resvg(FITNESS_SVG, { fitTo: { mode: 'width', value: SIZE } });
  writeFileSync(join(OUT_DIR, 'fitness.png'), resvg.render().asPng());
}

// "Więcej" — piktogram nadmiaru kategorii w klastrze (gdy jest ich więcej niż
// mieści się w siatce 2x2), neutralny szary, żeby nie sugerował konkretnego sportu.
const MORE_SVG = shell(
  '#64748b',
  `<g fill="#ffffff">
     <circle cx="32" cy="50" r="7"/>
     <circle cx="50" cy="50" r="7"/>
     <circle cx="68" cy="50" r="7"/>
   </g>`,
);
{
  const resvg = new Resvg(MORE_SVG, { fitTo: { mode: 'width', value: SIZE } });
  writeFileSync(join(OUT_DIR, 'more.png'), resvg.render().asPng());
}

console.log(`Wygenerowano ${Object.keys(EMOJI_ICONS).length + 2} ikon w ${OUT_DIR}`);
