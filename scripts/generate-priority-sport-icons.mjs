// Regenerates the 4 "priority" sport marker icons (basketball, football,
// tennis, volleyball) used both for individual map pins and for the
// per-sport mini-icons inside map clusters. Replaces the old white-dot +
// emoji look (generate-map-field-icons.py) with solid brand-color circles
// and hand-drawn pictograms, matching the reference mockup — higher
// contrast and legible at small marker sizes. Run: node scripts/generate-priority-sport-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'assets', 'map-field-icons');

const SIZE = 108; // 36 * 3 (@3x, matches FIELD_ICON_SCALE=3 in map-field-icons.ts)

function shell(bg, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">
    <ellipse cx="50" cy="53" rx="42" ry="41" fill="rgba(15,23,42,0.22)"/>
    <circle cx="50" cy="50" r="42" fill="${bg}" stroke="#ffffff" stroke-width="4"/>
    ${glyph}
  </svg>`;
}

const ICONS = {
  basketball: shell(
    '#f97316',
    `<circle cx="50" cy="50" r="26" fill="#ffffff"/>
     <g stroke="#ea580c" stroke-width="3.2" fill="none" stroke-linecap="round">
       <line x1="50" y1="24" x2="50" y2="76"/>
       <line x1="24" y1="50" x2="76" y2="50"/>
       <path d="M 50 24 Q 25 50 50 76"/>
       <path d="M 50 24 Q 75 50 50 76"/>
     </g>`,
  ),
  football: shell(
    '#22c55e',
    `<circle cx="50" cy="50" r="26" fill="#ffffff"/>
     <g fill="#14532d">
       <polygon points="50,38 58,44 55,53 45,53 42,44"/>
     </g>
     <g stroke="#14532d" stroke-width="3.2" stroke-linecap="round">
       <line x1="50" y1="38" x2="50" y2="27"/>
       <line x1="58" y1="44" x2="69" y2="37"/>
       <line x1="42" y1="44" x2="31" y2="37"/>
       <line x1="45" y1="53" x2="40" y2="66"/>
       <line x1="55" y1="53" x2="60" y2="66"/>
     </g>`,
  ),
  tennis: shell(
    '#eab308',
    `<circle cx="50" cy="50" r="26" fill="#fefce8"/>
     <g stroke="#a16207" stroke-width="3.2" fill="none" stroke-linecap="round">
       <path d="M 29 32 Q 50 50 29 68"/>
       <path d="M 71 32 Q 50 50 71 68"/>
     </g>`,
  ),
  volleyball: shell(
    '#06b6d4',
    `<circle cx="50" cy="50" r="26" fill="#ffffff"/>
     <g stroke="#0e7490" stroke-width="3.2" fill="none" stroke-linecap="round">
       <path d="M 27 42 Q 50 55 73 42"/>
       <path d="M 27 60 Q 50 47 73 60"/>
       <path d="M 50 25 Q 40 50 50 75"/>
     </g>`,
  ),
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [key, svg] of Object.entries(ICONS)) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } });
  const png = resvg.render().asPng();
  writeFileSync(join(OUT_DIR, `${key}.png`), png);
}

console.log(`Wygenerowano ${Object.keys(ICONS).length} ikon w ${OUT_DIR}`);
