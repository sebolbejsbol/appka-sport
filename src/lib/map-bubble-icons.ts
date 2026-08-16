import type { ImageEntry } from '@rnmapbox/maps';

/**
 * @3x — biały glif renderowany WEWNĄTRZ istniejącego kolorowego bąbla
 * (BUBBLE_CENTER_COLOR — events-map.tsx/.web.tsx "event-venue-icon",
 * map-view.tsx/.web.tsx "fields-icon" ORAZ siatka ikon w klastrach obu map,
 * patrz slotCategoryIconExpr w map-theme.ts), nie samodzielny znacznik —
 * dlatego bez własnego tła/obwódki, w przeciwieństwie do map-field-icons.ts
 * (ten drugi zestaw zostaje w kodzie, ale nie jest już nigdzie renderowany
 * na mapie — patrz historia commitów, 2026-08-14).
 * Generowane: scripts/generate-bubble-icons.mjs.
 */
const BUBBLE_ICON_SCALE = 3;

function icon(moduleId: number): ImageEntry {
  return { image: moduleId, scale: BUBBLE_ICON_SCALE };
}

// Prefiks "bubble_" celowo — bez niego klucze ("basketball", "football", ...)
// kolidowałyby z tymi samymi nazwami w mapFieldIcons (map-field-icons.ts),
// zarejestrowanymi na tym samym MapView przez osobny <Images>. Mapbox/MapLibre
// trzyma jedną globalną (per-mapa) przestrzeń nazw obrazków — dwa różne pliki
// pod tą samą nazwą nadpisałyby się nawzajem.
const KEY_PREFIX = 'bubble_';

/** Dokładnie FIELD_SPORTS w sports.ts — jedyne wartości, jakie `sport` faktycznie przyjmuje. */
const KNOWN_SPORTS = new Set([
  'basketball',
  'football',
  'volleyball',
  'tennis',
  'running',
  'swimming',
  'climbing',
  'skatepark',
  'padel',
  'badminton',
  'fitness',
  'outdoor_gym',
  'handball',
  'hockey',
  'music_club',
]);

export const mapBubbleIcons = {
  [`${KEY_PREFIX}basketball`]: icon(require('../../assets/map-bubble-icons/basketball.png')),
  [`${KEY_PREFIX}football`]: icon(require('../../assets/map-bubble-icons/football.png')),
  [`${KEY_PREFIX}volleyball`]: icon(require('../../assets/map-bubble-icons/volleyball.png')),
  [`${KEY_PREFIX}tennis`]: icon(require('../../assets/map-bubble-icons/tennis.png')),
  [`${KEY_PREFIX}running`]: icon(require('../../assets/map-bubble-icons/running.png')),
  [`${KEY_PREFIX}swimming`]: icon(require('../../assets/map-bubble-icons/swimming.png')),
  [`${KEY_PREFIX}climbing`]: icon(require('../../assets/map-bubble-icons/climbing.png')),
  [`${KEY_PREFIX}skatepark`]: icon(require('../../assets/map-bubble-icons/skatepark.png')),
  [`${KEY_PREFIX}padel`]: icon(require('../../assets/map-bubble-icons/padel.png')),
  [`${KEY_PREFIX}badminton`]: icon(require('../../assets/map-bubble-icons/badminton.png')),
  [`${KEY_PREFIX}fitness`]: icon(require('../../assets/map-bubble-icons/fitness.png')),
  [`${KEY_PREFIX}outdoor_gym`]: icon(require('../../assets/map-bubble-icons/outdoor_gym.png')),
  [`${KEY_PREFIX}handball`]: icon(require('../../assets/map-bubble-icons/handball.png')),
  [`${KEY_PREFIX}hockey`]: icon(require('../../assets/map-bubble-icons/hockey.png')),
  [`${KEY_PREFIX}music_club`]: icon(require('../../assets/map-bubble-icons/music_club.png')),
  /** Boisko wielofunkcyjne (`sport` = kilka dyscyplin połączonych „;”, np. "basketball;football"). */
  [`${KEY_PREFIX}multi`]: icon(require('../../assets/map-bubble-icons/multi.png')),
  /** Sport/typ bez rozpoznanej dyscypliny (null/nieznana wartość) — puchar zamiast kropki. */
  [`${KEY_PREFIX}generic`]: icon(require('../../assets/map-bubble-icons/generic.png')),
  /** Nadmiar kategorii w siatce ikon klastra (więcej niż mieści slot). */
  [`${KEY_PREFIX}more`]: icon(require('../../assets/map-bubble-icons/more.png')),
} as const;

export type BubbleIconKey = keyof typeof mapBubbleIcons;

/**
 * Klucz ikony bąbla dla danego sportu — nierozpoznane/puste trafiają na
 * domyślny puchar. Boiska wielofunkcyjne — `sport` = "basketball;football"
 * itd. (patrz formatSportLabel/fieldMarkerColor w sports.ts, które już
 * dzielą po „;") ALBO dosłowne "multi" (patrz defaultCourtNameForSport w
 * field-display.ts) — dawniej też lądowały na tym samym pucharze, bo żadna
 * z tych wartości nigdy nie pasowała do KNOWN_SPORTS — teraz dostają własną
 * ikonę stadionu zamiast pucharu (myląco kojarzącego się z nagrodą).
 */
export function bubbleIconKey(sport: string | null | undefined): BubbleIconKey {
  if (!sport) return `${KEY_PREFIX}generic` as BubbleIconKey;
  if (KNOWN_SPORTS.has(sport)) return `${KEY_PREFIX}${sport}` as BubbleIconKey;
  if (sport === 'multi' || sport.includes(';')) return `${KEY_PREFIX}multi` as BubbleIconKey;
  return `${KEY_PREFIX}generic` as BubbleIconKey;
}
