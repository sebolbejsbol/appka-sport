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

/**
 * `fields.sport` przechowuje surowy tag OSM importu, który dla wielu
 * rekordów wcale nie jest dyscypliną sportu — to kategoria miejsca
 * (park/biblioteka/muzeum/...). Zgłoszenie 2026-08-16: te rekordy (park —
 * 5271 wierszy, community_centre — 4564, library — 3558, museum — 2695,
 * arts_centre — 1302, photo_studio — 1247, conference_centre — 922,
 * theatre — 872, cinema — 564, na produkcyjnej bazie) trafiały na
 * `generic` (puchar), co użytkownik zgłosił jako mylące — "nic nie
 * oznacza, tylko myli". Mają już własną ikonę w assets/map-field-icons/
 * (kolorowa plakietka, patrz generate-priority-sport-icons.mjs) — teraz
 * dostają też odpowiednik w tym (białym, bez tła) zestawie zamiast
 * pucharu. `pottery` zostaje na `generic` — brak dobrego odpowiednika w
 * Material Symbols (patrz komentarz przy SKIPPED_KEYS w
 * generate-priority-sport-icons.mjs), zbyt mało rekordów (149), żeby to
 * było priorytetem.
 */
const KNOWN_PLACE_CATEGORIES = new Set([
  'park',
  'museum',
  'theatre',
  'cinema',
  'library',
  'concert_hall',
  'community_centre',
  'coworking',
  'conference_centre',
  'arts_centre',
  'photo_studio',
  'cooking_school',
  'chess',
]);

/**
 * Warianty/synonimy tagów OSM, które oznaczają dokładnie ten sam obiekt co
 * jeden z KNOWN_SPORTS, ale pod inną nazwą — dawniej lądowały na pucharze,
 * co przy sąsiedztwie z prawdziwą dyscypliną (patrz zgłoszenie 2026-08-16,
 * Zrzut 4: "athletics" obok "running" na tym samym boisku szkolnym) mylnie
 * wyglądało jak dwie różne ikony tego samego miejsca. `athletics` to
 * dokładnie bieżnia/stadion lekkoatletyczny — ten sam obiekt co `running`.
 */
const SPORT_ALIASES: Record<string, string> = {
  athletics: 'running',
  beachvolleyball: 'volleyball',
  skateboard: 'skatepark',
  team_handball: 'handball',
  ['five-a-side']: 'football',
  soccer: 'football',
};

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
  /** Kategorie miejsc spoza sportu, patrz KNOWN_PLACE_CATEGORIES powyżej. */
  [`${KEY_PREFIX}park`]: icon(require('../../assets/map-bubble-icons/park.png')),
  [`${KEY_PREFIX}museum`]: icon(require('../../assets/map-bubble-icons/museum.png')),
  [`${KEY_PREFIX}theatre`]: icon(require('../../assets/map-bubble-icons/theatre.png')),
  [`${KEY_PREFIX}cinema`]: icon(require('../../assets/map-bubble-icons/cinema.png')),
  [`${KEY_PREFIX}library`]: icon(require('../../assets/map-bubble-icons/library.png')),
  [`${KEY_PREFIX}concert_hall`]: icon(require('../../assets/map-bubble-icons/concert_hall.png')),
  [`${KEY_PREFIX}community_centre`]: icon(require('../../assets/map-bubble-icons/community_centre.png')),
  [`${KEY_PREFIX}coworking`]: icon(require('../../assets/map-bubble-icons/coworking.png')),
  [`${KEY_PREFIX}conference_centre`]: icon(require('../../assets/map-bubble-icons/conference_centre.png')),
  [`${KEY_PREFIX}arts_centre`]: icon(require('../../assets/map-bubble-icons/arts_centre.png')),
  [`${KEY_PREFIX}photo_studio`]: icon(require('../../assets/map-bubble-icons/photo_studio.png')),
  [`${KEY_PREFIX}cooking_school`]: icon(require('../../assets/map-bubble-icons/cooking_school.png')),
  [`${KEY_PREFIX}chess`]: icon(require('../../assets/map-bubble-icons/chess.png')),
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
  if (KNOWN_PLACE_CATEGORIES.has(sport)) return `${KEY_PREFIX}${sport}` as BubbleIconKey;
  const alias = SPORT_ALIASES[sport];
  if (alias) return `${KEY_PREFIX}${alias}` as BubbleIconKey;
  return `${KEY_PREFIX}generic` as BubbleIconKey;
}
