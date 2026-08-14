import type { ImageEntry } from '@rnmapbox/maps';

/**
 * @3x — biały glif renderowany WEWNĄTRZ istniejącego kolorowego bąbla eventu
 * (BUBBLE_CENTER_COLOR w events-map.tsx/.web.tsx), nie samodzielny znacznik —
 * dlatego bez własnego tła/obwódki, w przeciwieństwie do map-field-icons.ts.
 * Generowane: scripts/generate-event-bubble-icons.mjs.
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

/** Klucze (bez prefiksu) muszą pokrywać dokładnie SUBCATEGORIES.sport w event-categories.ts. */
export const mapEventBubbleIcons = {
  [`${KEY_PREFIX}basketball`]: icon(require('../../assets/map-event-bubble-icons/basketball.png')),
  [`${KEY_PREFIX}football`]: icon(require('../../assets/map-event-bubble-icons/football.png')),
  [`${KEY_PREFIX}volleyball`]: icon(require('../../assets/map-event-bubble-icons/volleyball.png')),
  [`${KEY_PREFIX}tennis`]: icon(require('../../assets/map-event-bubble-icons/tennis.png')),
  [`${KEY_PREFIX}running`]: icon(require('../../assets/map-event-bubble-icons/running.png')),
  [`${KEY_PREFIX}swimming`]: icon(require('../../assets/map-event-bubble-icons/swimming.png')),
  [`${KEY_PREFIX}climbing`]: icon(require('../../assets/map-event-bubble-icons/climbing.png')),
  [`${KEY_PREFIX}skatepark`]: icon(require('../../assets/map-event-bubble-icons/skatepark.png')),
  [`${KEY_PREFIX}padel`]: icon(require('../../assets/map-event-bubble-icons/padel.png')),
  [`${KEY_PREFIX}badminton`]: icon(require('../../assets/map-event-bubble-icons/badminton.png')),
  [`${KEY_PREFIX}fitness`]: icon(require('../../assets/map-event-bubble-icons/fitness.png')),
  [`${KEY_PREFIX}outdoor_gym`]: icon(require('../../assets/map-event-bubble-icons/outdoor_gym.png')),
  [`${KEY_PREFIX}handball`]: icon(require('../../assets/map-event-bubble-icons/handball.png')),
  /** Event bez rozpoznanej dyscypliny (sport=null/nieznana wartość) — puchar zamiast kropki. */
  [`${KEY_PREFIX}generic`]: icon(require('../../assets/map-event-bubble-icons/generic.png')),
} as const;

export type EventBubbleIconKey = keyof typeof mapEventBubbleIcons;

const KNOWN_SPORTS = new Set(
  Object.keys(mapEventBubbleIcons).map((key) => key.slice(KEY_PREFIX.length)),
);

/** Klucz ikony bąbla dla danego sportu — nierozpoznane/puste trafiają na domyślny puchar. */
export function eventBubbleIconKey(sport: string | null | undefined): EventBubbleIconKey {
  if (sport && KNOWN_SPORTS.has(sport)) return `${KEY_PREFIX}${sport}` as EventBubbleIconKey;
  return `${KEY_PREFIX}generic` as EventBubbleIconKey;
}
