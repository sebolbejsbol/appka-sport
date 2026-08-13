// Generates ALL map marker icons (assets/map-field-icons/) in one consistent
// style: solid brand-color circle + white ring + white monochrome glyph.
// Supersedes the older generate-map-field-icons.py look (white dot + thin
// colored ring + full-color emoji), which read as pale/washed-out at marker
// size and, for a few glyphs (e.g. running), rendered inside what looked
// like a prohibition/warning sign because of the emoji's own baked-in
// circle. resvg only renders the system font's monochrome fallback glyph
// (not color emoji), so glyph + circle colors are fully ours to control —
// no more accidental "no entry" signs.
//
// Kolory/emoji muszą być spójne z src/lib/sports.ts (FIELD_MARKER_*).
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
  running: ['#ef4444', '🏃'],
  swimming: ['#0284c7', '🏊'],
  climbing: ['#92400e', '🧗'],
  skatepark: ['#8b5cf6', '🛹'],
  outdoor_gym: ['#14b8a6', '🏋️'],
  music_club: ['#a855f7', '🎶'],
  multi: ['#6366f1', '🥅'],
  generic: ['#1f6bff', '📍'],
  handball: ['#0ea5e9', '🤾'],
  badminton: ['#84cc16', '🏸'],
  padel: ['#0d9488', '🏓'],
  arts_centre: ['#a78bfa', '🎨'],
  photo_studio: ['#7c3aed', '📷'],
  pottery: ['#b45309', '🏺'],
  cooking_school: ['#fb923c', '🍳'],
  chess: ['#6b7280', '♟️'],
  park: ['#10b981', '🌳'],
  museum: ['#db2777', '🖼️'],
  theatre: ['#f472b6', '🎭'],
  cinema: ['#d946ef', '🎬'],
  library: ['#e11d48', '📖'],
  concert_hall: ['#f59e0b', '🎤'],
  community_centre: ['#3b82f6', '🎓'],
  coworking: ['#78716c', '🤝'],
  conference_centre: ['#475569', '🏢'],
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

console.log(`Wygenerowano ${Object.keys(EMOJI_ICONS).length + 2} ikon w ${OUT_DIR}`);
