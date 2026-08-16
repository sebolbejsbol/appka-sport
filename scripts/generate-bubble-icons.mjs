// Generates the sport glyphs shown INSIDE a single colored bubble —
// used on BOTH the events map (src/components/events-map.tsx/.web.tsx,
// SymbolLayer "event-venue-icon") AND the main courts map
// (src/components/map-view.tsx/.web.tsx, SymbolLayer "fields-icon").
// Unlike assets/map-field-icons/ (a colored circle badge per sport, meant
// to stand alone on a plain map — that set is still used for the CLUSTER
// icon grid, where multiple sports sit side by side with no shared
// background) or assets/map-event-icons/ (a colored ring badge, unused
// today), these are WHITE, glyph-only, TRANSPARENT-background PNGs — meant
// to be composited on top of a bubble that's ALREADY colored
// (BUBBLE_CENTER_COLOR, blue), so a colored badge-within-a-badge doesn't
// fight the bubble for attention and the glyph reads with maximum
// contrast. (This is exactly the "little person" bug reported 2026-08-14:
// the main map's single-court "fields-icon" layer was still using the
// old colored-badge set shrunk to ~30-60% size inside the blue bubble —
// unreadable. Fixed by switching it to this set too.)
//
// Glyphs come from Google's Material Symbols (@material-symbols/svg-400,
// Apache-2.0) — the same library already used for assets/map-field-icons/,
// see scripts/generate-priority-sport-icons.mjs. -fill variants are used
// where available: filled glyphs stay legible at the ~20px display size a
// bubble icon renders at, where thin outlined strokes disappear.
//
// Run: node scripts/generate-bubble-icons.mjs
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'assets', 'map-bubble-icons');
const MATERIAL_DIR = join(ROOT, 'node_modules', '@material-symbols', 'svg-400', 'rounded');

// @3x, natural display size 24px (72/3) — matches the ~44px bubbles both
// maps use (circleRadius 22) with room for the count text offset to the
// same side.
const SIZE = 72;

// Musi obejmować dokładnie FIELD_SPORTS z src/lib/sports.ts (wszystkie
// sportowe typy obiektów na mapie — nadzbiór SUBCATEGORIES.sport z
// event-categories.ts, bo boiska/obiekty mają też hockey i music_club,
// których jako TYPU EVENTU nie ma).
// key -> plik ikony w @material-symbols/svg-400/rounded (bez .svg)
const MATERIAL_ICONS = {
  basketball: 'sports_basketball-fill',
  football: 'sports_soccer-fill',
  volleyball: 'sports_volleyball-fill',
  running: 'directions_run-fill',
  swimming: 'pool-fill',
  climbing: 'hiking-fill',
  skatepark: 'skateboarding-fill',
  padel: 'pickleball-fill',
  badminton: 'badminton-fill',
  outdoor_gym: 'fitness_center-fill',
  handball: 'sports_handball-fill',
  hockey: 'sports_hockey-fill',
  music_club: 'music_note-fill',
  // Boisko wielofunkcyjne (sport = "basketball;football" itd., patrz
  // bubbleIconKey w map-bubble-icons.ts) — stadion zamiast pucharu
  // (generic.png), żeby nie sugerować nagrody/turnieju.
  multi: 'stadium-fill',
  // "Inne obiekty" zaimportowane z OSM pod tą samą kolumną `sport` co
  // dyscypliny sportowe (park/biblioteka/muzeum/... — patrz zgłoszenie
  // 2026-08-16: tysiące takich rekordów w bazie, żaden nie pasował do
  // KNOWN_SPORTS, więc wszystkie lądowały na pucharze). Te same glify co
  // assets/map-field-icons/ (generate-priority-sport-icons.mjs), tylko
  // białe/bez tła jak reszta tego zestawu.
  park: 'park-fill',
  museum: 'museum-fill',
  theatre: 'theater_comedy-fill',
  cinema: 'movie-fill',
  library: 'local_library-fill',
  concert_hall: 'mic-fill',
  community_centre: 'groups-fill',
  coworking: 'business_center-fill',
  conference_centre: 'corporate_fare-fill',
  arts_centre: 'palette-fill',
  photo_studio: 'photo_camera-fill',
  cooking_school: 'cooking-fill',
  chess: 'chess-fill',
};

/** Bez tła/obwódki — tylko biały glif, wyśrodkowany w przezroczystym kwadracie. */
function shell(glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 100 100">${glyph}</svg>`;
}

/**
 * Material Symbols: viewBox 960x960 (center 480,-480), skalujemy do ~80px —
 * większy niż wcześniejsze 64px (2026-08-14: "muszą być bardziej wyraźne"),
 * glif ma wypełniać bąbel wyraźnie, nie zostawiać dużo pustego marginesu.
 */
function materialGlyph(pathD) {
  const scale = 80 / 960;
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

for (const [key, materialFile] of Object.entries(MATERIAL_ICONS)) {
  const svgSource = readFileSync(join(MATERIAL_DIR, `${materialFile}.svg`), 'utf8');
  const pathD = extractPathD(svgSource);
  const resvg = new Resvg(shell(materialGlyph(pathD)), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
  });
  writeFileSync(join(OUT_DIR, `${key}.png`), resvg.render().asPng());
}

// Tenis — ta sama ręcznie rysowana rakieta co assets/map-field-icons/tennis.png
// (Material Symbols sports_tennis czyta się jak lizak w tym rozmiarze), tylko
// bez kolorowej tarczy pod spodem.
const TENNIS_SVG = shell(
  `<g transform="translate(40,38) rotate(-25)" fill="none" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round">
     <ellipse cx="0" cy="-19" rx="14.5" ry="18.5"/>
     <line x1="-7" y1="-29" x2="7" y2="-9"/>
     <line x1="7" y1="-29" x2="-7" y2="-9"/>
     <line x1="0" y1="-37.5" x2="0" y2="-0.5"/>
     <line x1="-12" y1="-19" x2="12" y2="-19"/>
     <line x1="0" y1="0" x2="0" y2="22"/>
   </g>
   <circle cx="73" cy="68" r="13" fill="#ffffff"/>`,
);
writeFileSync(
  join(OUT_DIR, 'tennis.png'),
  new Resvg(TENNIS_SVG, { fitTo: { mode: 'width', value: SIZE } }).render().asPng(),
);

// Siłownia — te same proste hantle co assets/map-field-icons/fitness.png,
// bez kolorowej tarczy pod spodem.
const FITNESS_SVG = shell(
  `<g fill="#ffffff">
     <rect x="13" y="38" width="17" height="24" rx="4"/>
     <rect x="70" y="38" width="17" height="24" rx="4"/>
     <rect x="26" y="46" width="48" height="8" rx="4"/>
   </g>`,
);
writeFileSync(
  join(OUT_DIR, 'fitness.png'),
  new Resvg(FITNESS_SVG, { fitTo: { mode: 'width', value: SIZE } }).render().asPng(),
);

// Domyślna ikona dla eventów/boisk bez rozpoznanej dyscypliny (sport=null/
// nieznany typ) — puchar, zamiast dawnej "kropki".
const trophySvg = readFileSync(join(MATERIAL_DIR, 'trophy-fill.svg'), 'utf8');
writeFileSync(
  join(OUT_DIR, 'generic.png'),
  new Resvg(shell(materialGlyph(extractPathD(trophySvg))), {
    fitTo: { mode: 'width', value: SIZE },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng(),
);

// "Więcej" — piktogram nadmiaru kategorii w siatce klastra (gdy jest ich
// więcej niż mieści slot), te same 3 kropki co assets/map-field-icons/
// more.png, białe zamiast na szarej tarczy.
const MORE_SVG = shell(
  `<g fill="#ffffff">
     <circle cx="26" cy="50" r="9"/>
     <circle cx="50" cy="50" r="9"/>
     <circle cx="74" cy="50" r="9"/>
   </g>`,
);
writeFileSync(
  join(OUT_DIR, 'more.png'),
  new Resvg(MORE_SVG, { fitTo: { mode: 'width', value: SIZE } }).render().asPng(),
);

console.log(`Wygenerowano ${Object.keys(MATERIAL_ICONS).length + 4} ikon bąbli w ${OUT_DIR}`);
