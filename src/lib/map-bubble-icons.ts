import type { ImageEntry } from '@rnmapbox/maps';

/**
 * @3x — biały glif renderowany WEWNĄTRZ istniejącego kolorowego bąbla
 * (BUBBLE_CENTER_COLOR — events-map.tsx/.web.tsx "event-venue-icon" I
 * map-view.tsx/.web.tsx "fields-icon"), nie samodzielny znacznik — dlatego
 * bez własnego tła/obwódki, w przeciwieństwie do map-field-icons.ts (ten
 * drugi zestaw zostaje w użyciu tylko dla siatki ikon w klastrach, gdzie
 * kilka sportów stoi obok siebie bez wspólnego tła).
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

/** Klucze (bez prefiksu) muszą pokrywać dokładnie FIELD_SPORTS w sports.ts. */
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
  /** Sport/typ bez rozpoznanej dyscypliny (null/nieznana wartość) — puchar zamiast kropki. */
  [`${KEY_PREFIX}generic`]: icon(require('../../assets/map-bubble-icons/generic.png')),
} as const;

export type BubbleIconKey = keyof typeof mapBubbleIcons;

const KNOWN_SPORTS = new Set(Object.keys(mapBubbleIcons).map((key) => key.slice(KEY_PREFIX.length)));

/** Klucz ikony bąbla dla danego sportu — nierozpoznane/puste trafiają na domyślny puchar. */
export function bubbleIconKey(sport: string | null | undefined): BubbleIconKey {
  if (sport && KNOWN_SPORTS.has(sport)) return `${KEY_PREFIX}${sport}` as BubbleIconKey;
  return `${KEY_PREFIX}generic` as BubbleIconKey;
}
