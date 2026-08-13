// Generates ALL map marker icons (assets/map-field-icons/) in one consistent
// style: solid brand-color circle + white ring + white icon glyph.
//
// Glyphs come from Google's Material Symbols (@material-symbols/svg-400,
// Apache-2.0, https://github.com/google/material-design-icons) — real,
// purpose-drawn vector icons (an actual basketball, a tennis racket + ball,
// a soccer ball...) instead of the earlier approach of rendering the system
// font's monochrome emoji-fallback glyph, which looked inconsistent across
// OSes and, for a few glyphs, rendered oddly (e.g. running looked like a
// prohibition sign because of the emoji's own baked-in circle).
//
// A few categories have no good Material Symbols match (pottery has none;
// fitness/"more" render badly or aren't real icons) — those keep their
// existing hand-drawn/emoji-rendered PNGs untouched, see the exceptions
// list below.
//
// Kolory/klucze muszą być spójne z src/lib/sports.ts (FIELD_MARKER_*) i
// src/lib/map-field-icons.ts.
// Run: node scripts/generate-priority-sport-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'assets', 'map-field-icons');
const MATERIAL_DIR = join(ROOT, 'node_modules', '@material-symbols', 'svg-400', 'rounded');

const SIZE = 108; // 36 * 3 (@3x, matches FIELD_ICON_SCALE=3 in map-field-icons.ts)

// key -> [kolor tła, plik ikony w @material-symbols/svg-400/rounded (bez .svg)]
const MATERIAL_ICONS = {
  basketball: ['#f97316', 'sports_basketball'],
  football: ['#22c55e', 'sports_soccer'],
  tennis: ['#eab308', 'sports_tennis'],
  volleyball: ['#06b6d4', 'sports_volleyball'],
  hockey: ['#1d4ed8', 'sports_hockey'],
  running: ['#ef4444', 'directions_run'],
  swimming: ['#0284c7', 'pool'],
  climbing: ['#92400e', 'hiking'],
  skatepark: ['#8b5cf6', 'skateboarding'],
  outdoor_gym: ['#14b8a6', 'fitness_center'],
  music_club: ['#a855f7', 'music_note'],
  multi: ['#6366f1', 'sports_and_outdoors'],
  generic: ['#1f6bff', 'location_on'],
  handball: ['#0ea5e9', 'sports_handball'],
  badminton: ['#84cc16', 'badminton'],
  padel: ['#0d9488', 'pickleball'],
  arts_centre: ['#a78bfa', 'palette'],
  photo_studio: ['#7c3aed', 'photo_camera'],
  cooking_school: ['#fb923c', 'cooking'],
  chess: ['#6b7280', 'chess'],
  park: ['#10b981', 'park'],
  museum: ['#db2777', 'museum'],
  theatre: ['#f472b6', 'theater_comedy'],
  cinema: ['#d946ef', 'movie'],
  library: ['#e11d48', 'local_library'],
  concert_hall: ['#f59e0b', 'mic'],
  community_centre: ['#3b82f6', 'groups'],
  coworking: ['#78716c', 'business_center'],
  conference_centre: ['#475569', 'corporate_fare'],
};

/** pottery.png keeps its existing hand-rendered art — no decent Material Symbols match. */
const SKIPPED_KEYS = ['pottery'];

function shell(bg, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">
    <ellipse cx="50" cy="53" rx="42" ry="41" fill="rgba(15,23,42,0.22)"/>
    <circle cx="50" cy="50" r="42" fill="${bg}" stroke="#ffffff" stroke-width="4"/>
    ${glyph}
  </svg>`;
}

/**
 * Material Symbols paths live in a 960x960 box, viewBox="0 -960 960 960"
 * (center at 960/2=480, -480). Recenters to origin, scales to ~60px across
 * (matches the old emoji glyph's visual weight inside the same 100x100
 * shell), then moves to the shell's center.
 */
function materialGlyph(pathD) {
  const scale = 60 / 960;
  return `<g transform="translate(50,50) scale(${scale}) translate(-480,480)">
    <path d="${pathD}" fill="#ffffff"/>
  </g>`;
}

function extractPathD(svgSource) {
  const match = svgSource.match(/<path\s+d="([^"]+)"/);
  if (!match) throw new Error('No <path d="..."> found in Material Symbols SVG');
  return match[1];
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, [bg, materialFile]] of Object.entries(MATERIAL_ICONS)) {
  const svgSource = readFileSync(join(MATERIAL_DIR, `${materialFile}.svg`), 'utf8');
  const pathD = extractPathD(svgSource);
  const resvg = new Resvg(shell(bg, materialGlyph(pathD)), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `${key}.png`), png);
}

// Fitness/siłownia — proste, geometryczne hantle, spójne z resztą rodziny
// ikon (brak figur ludzkich), rysowane ręcznie zamiast przez ikonę biblioteki.
const FITNESS_SVG = shell(
  '#ec4899',
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

console.log(
  `Wygenerowano ${Object.keys(MATERIAL_ICONS).length + 2} ikon w ${OUT_DIR} ` +
    `(pominięto: ${SKIPPED_KEYS.join(', ')} — zachowują istniejący plik)`,
);
