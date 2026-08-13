import { t } from '@/i18n';

export const TEAM_SPORTS = ['basketball', 'football', 'volleyball', 'handball'] as const;

export type TeamSport = (typeof TEAM_SPORTS)[number];

/** Typy obiektów widocznych na mapie (bąble). Importowane z OSM dla całej Polski. */
export const FIELD_SPORTS = [
  'basketball',
  'football',
  'tennis',
  'volleyball',
  'running',
  'swimming',
  'climbing',
  'skatepark',
  'fitness',
  'outdoor_gym',
  'handball',
  'badminton',
  'padel',
  'hockey',
  'music_club',
] as const;

/**
 * Kolor znacznika na mapie dla danego typu obiektu — żeby od razu było widać
 * „co gdzie” (np. koszykówka = pomarańczowa kropka). Obiekty wielofunkcyjne
 * biorą kolor pierwszej dyscypliny.
 */
const FIELD_MARKER_COLORS: Record<string, string> = {
  basketball: '#f97316', // pomarańczowy
  football: '#22c55e', // zielony
  soccer: '#22c55e',
  tennis: '#eab308', // żółty
  volleyball: '#06b6d4', // cyjan
  beachvolleyball: '#06b6d4',
  running: '#ef4444', // czerwony
  athletics: '#ef4444',
  swimming: '#0284c7', // niebieski
  climbing: '#92400e', // brązowy
  skatepark: '#8b5cf6', // fioletowy
  skateboard: '#8b5cf6',
  fitness: '#ec4899', // różowy (siłownie prywatne)
  outdoor_gym: '#14b8a6', // morski (siłownie plenerowe)
  music_club: '#a855f7', // fiolet
  handball: '#0ea5e9', // błękit
  badminton: '#84cc16', // limonka
  padel: '#0d9488', // teal
  hockey: '#1d4ed8', // granat
  // hobby
  arts_centre: '#8b5cf6',
  photo_studio: '#7c3aed',
  pottery: '#b45309',
  cooking_school: '#fb923c',
  chess: '#6b7280',
  // rekreacja
  park: '#10b981',
  // kultura
  museum: '#db2777',
  theatre: '#ec4899',
  cinema: '#d946ef',
  library: '#e11d48',
  // muzyka
  concert_hall: '#f59e0b',
  // edukacja
  community_centre: '#3b82f6',
  // biznes
  coworking: '#64748b',
  conference_centre: '#475569',
};

const DEFAULT_MARKER_COLOR = '#1f6bff';

export function fieldMarkerColor(sport: string | null | undefined): string {
  if (!sport?.trim()) return DEFAULT_MARKER_COLOR;
  const first = sport.split(';')[0]?.trim() ?? '';
  return FIELD_MARKER_COLORS[first] ?? FIELD_MARKER_COLORS[sport] ?? DEFAULT_MARKER_COLOR;
}

/** Emoji w środku znacznika — od razu widać, jaka to kategoria obiektu. */
const FIELD_MARKER_EMOJI: Record<string, string> = {
  basketball: '🏀',
  football: '⚽',
  soccer: '⚽',
  tennis: '🎾',
  volleyball: '🏐',
  beachvolleyball: '🏐',
  running: '🏃',
  athletics: '🏃',
  swimming: '🏊',
  climbing: '🧗',
  skatepark: '🛹',
  skateboard: '🛹',
  fitness: '💪',
  outdoor_gym: '🏋️',
  music_club: '🎶',
  multi: '🥅',
  handball: '🤾',
  badminton: '🏸',
  padel: '🎾',
  hockey: '🏒',
  // hobby
  arts_centre: '🎨',
  photo_studio: '📷',
  pottery: '🏺',
  cooking_school: '🍳',
  chess: '♟️',
  // rekreacja
  park: '🌳',
  // kultura
  museum: '🖼️',
  theatre: '🎭',
  cinema: '🎬',
  library: '📖',
  // muzyka
  concert_hall: '🎤',
  // edukacja
  community_centre: '🎓',
  // biznes
  coworking: '🤝',
  conference_centre: '🏢',
};

const DEFAULT_MARKER_EMOJI = '📍';

export function fieldMarkerEmoji(sport: string | null | undefined): string {
  if (!sport?.trim()) return DEFAULT_MARKER_EMOJI;
  const first = sport.split(';')[0]?.trim() ?? '';
  return FIELD_MARKER_EMOJI[first] ?? FIELD_MARKER_EMOJI[sport] ?? DEFAULT_MARKER_EMOJI;
}

/**
 * Klucz gotowej ikonki PNG (kolorowa kropka + emoji wypalone w obrazku).
 * Mapbox nie renderuje emoji w warstwie tekstu (zwłaszcza na Androidzie),
 * więc znacznik to obrazek — patrz scripts/generate-map-field-icons.py.
 */
const FIELD_MARKER_ICON: Record<string, string> = {
  basketball: 'basketball',
  football: 'football',
  soccer: 'football',
  tennis: 'tennis',
  volleyball: 'volleyball',
  beachvolleyball: 'volleyball',
  running: 'running',
  athletics: 'running',
  swimming: 'swimming',
  climbing: 'climbing',
  skatepark: 'skatepark',
  skateboard: 'skatepark',
  fitness: 'fitness',
  outdoor_gym: 'outdoor_gym',
  music_club: 'music_club',
  multi: 'multi',
  handball: 'handball',
  badminton: 'badminton',
  padel: 'padel',
  hockey: 'hockey',
  // hobby
  arts_centre: 'arts_centre',
  photo_studio: 'photo_studio',
  pottery: 'pottery',
  cooking_school: 'cooking_school',
  chess: 'chess',
  // rekreacja
  park: 'park',
  // kultura
  museum: 'museum',
  theatre: 'theatre',
  cinema: 'cinema',
  library: 'library',
  // muzyka
  concert_hall: 'concert_hall',
  // edukacja
  community_centre: 'community_centre',
  // biznes
  coworking: 'coworking',
  conference_centre: 'conference_centre',
};

export function fieldMarkerIcon(sport: string | null | undefined): string {
  if (!sport?.trim()) return 'generic';
  const first = sport.split(';')[0]?.trim() ?? '';
  return FIELD_MARKER_ICON[first] ?? FIELD_MARKER_ICON[sport.trim()] ?? 'generic';
}

export type FieldSport = (typeof FIELD_SPORTS)[number];

export type SportFilter = FieldSport | 'all';

export const DEFAULT_SPORT_FILTER: SportFilter = 'basketball';

export function isTeamSport(value: string): value is TeamSport {
  return (TEAM_SPORTS as readonly string[]).includes(value);
}

export function isFieldSport(value: string): value is FieldSport {
  return (FIELD_SPORTS as readonly string[]).includes(value);
}

/** Wartość dla RPC `sport_filter` — null = wszystkie dyscypliny. */
export function sportFilterToRpc(sport: SportFilter): string | null {
  return sport === 'all' ? null : sport;
}

export function formatTeamSport(sport: string): string {
  return formatSportLabel(sport);
}

export function formatSportLabel(sport: string | null | undefined): string {
  if (!sport?.trim()) return t('field.sports.basketball');
  // Obiekty wielofunkcyjne („basketball;football”) → etykiety po przecinku.
  if (sport.includes(';')) {
    const parts = sport
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts.map((p) => formatSportLabel(p)).join(' · ');
  }
  switch (sport) {
    case 'basketball':
      return t('field.sports.basketball');
    case 'football':
      return t('field.sports.football');
    case 'tennis':
      return t('field.sports.tennis');
    case 'volleyball':
    case 'beachvolleyball':
      return t('field.sports.volleyball');
    case 'handball':
      return t('field.sports.handball');
    case 'running':
    case 'athletics':
      return t('field.sports.running');
    case 'swimming':
      return t('field.sports.swimming');
    case 'climbing':
      return t('field.sports.climbing');
    case 'skatepark':
    case 'skateboard':
      return t('field.sports.skatepark');
    case 'fitness':
      return t('field.sports.fitness');
    case 'outdoor_gym':
      return t('field.sports.outdoor_gym');
    case 'music_club':
      return t('field.sports.music_club');
    case 'badminton':
      return t('field.sports.badminton');
    case 'padel':
      return t('field.sports.padel');
    case 'hockey':
      return t('field.sports.hockey');
    case 'arts_centre':
      return t('field.sports.arts_centre');
    case 'photo_studio':
      return t('field.sports.photo_studio');
    case 'pottery':
      return t('field.sports.pottery');
    case 'cooking_school':
      return t('field.sports.cooking_school');
    case 'chess':
      return t('field.sports.chess');
    case 'park':
      return t('field.sports.park');
    case 'museum':
      return t('field.sports.museum');
    case 'theatre':
      return t('field.sports.theatre');
    case 'cinema':
      return t('field.sports.cinema');
    case 'library':
      return t('field.sports.library');
    case 'concert_hall':
      return t('field.sports.concert_hall');
    case 'community_centre':
      return t('field.sports.community_centre');
    case 'coworking':
      return t('field.sports.coworking');
    case 'conference_centre':
      return t('field.sports.conference_centre');
    case 'multi':
      return t('field.sports.multi');
    default:
      return sport;
  }
}

export function sportFilterLabel(sport: SportFilter): string {
  if (sport === 'all') return t('eventFilters.sportAll');
  return formatSportLabel(sport);
}
