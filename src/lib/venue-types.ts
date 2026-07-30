/**
 * Mapowanie kategorii/podkategorii wydarzeń na typy obiektów na mapie
 * (kolumna `fields.sport`). Dzięki temu kreator wydarzenia podpowiada miejsca
 * zgodne z tym, co tworzymy (np. badminton → korty do badmintona, teatr →
 * teatry), a mapa pokazuje właściwe obiekty po wybraniu kategorii.
 */

import type { CategoryFilter, EventCategory } from '@/lib/event-categories';

/** Wszystkie sportowe typy obiektów (kolumna fields.sport). */
export const SPORT_FIELD_TYPES = [
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
] as const;

/**
 * Podkategoria wydarzenia → typy obiektów na mapie, na których takie wydarzenie
 * może się odbyć. Pusta/brak = brak dedykowanych obiektów (tylko pinezka).
 */
export const SUBCATEGORY_FIELD_TYPES: Record<string, string[]> = {
  // sport
  basketball: ['basketball'],
  football: ['football'],
  volleyball: ['volleyball'],
  tennis: ['tennis'],
  running: ['running'],
  swimming: ['swimming'],
  climbing: ['climbing'],
  skatepark: ['skatepark'],
  padel: ['padel'],
  badminton: ['badminton'],
  fitness: ['fitness'],
  outdoor_gym: ['outdoor_gym'],
  handball: ['handball'],
  // hobby
  painting: ['arts_centre'],
  drawing: ['arts_centre'],
  photography: ['photo_studio'],
  cooking: ['cooking_school', 'arts_centre'],
  chess: ['chess', 'community_centre'],
  ceramics: ['pottery', 'arts_centre'],
  crafts: ['arts_centre'],
  // rekreacja
  walk: ['park'],
  cycling: ['park'],
  yoga: ['fitness'],
  outdoor: ['park'],
  // kultura
  exhibition: ['museum'],
  theatre: ['theatre'],
  cinema: ['cinema'],
  author_meeting: ['library'],
  // muzyka
  concert: ['concert_hall', 'music_club'],
  dj_set: ['music_club'],
  festival: ['music_club', 'concert_hall'],
  jam_session: ['music_club'],
  music_club: ['music_club'],
  // edukacja
  workshop: ['community_centre', 'arts_centre'],
  course: ['community_centre'],
  training: ['community_centre'],
  lecture: ['library', 'community_centre'],
  // biznes
  networking: ['coworking', 'community_centre'],
  conference: ['conference_centre'],
  meetup: ['coworking', 'community_centre'],
  fair: ['conference_centre'],
};

/** Typy obiektów dla całej kategorii (suma podkategorii, bez powtórzeń). */
export const CATEGORY_FIELD_TYPES: Record<EventCategory, string[]> = {
  sport: [...SPORT_FIELD_TYPES],
  hobby: ['arts_centre', 'photo_studio', 'pottery', 'cooking_school', 'chess'],
  rekreacja: ['park', 'fitness'],
  kultura: ['museum', 'theatre', 'cinema', 'library'],
  muzyka: ['music_club', 'concert_hall'],
  edukacja: ['community_centre', 'library'],
  biznes: ['coworking', 'conference_centre'],
  inne: [],
};

/**
 * Typy obiektów pasujące do bieżącego wyboru kategorii/podkategorii.
 * Podkategoria ma pierwszeństwo (precyzyjny typ), inaczej cała kategoria.
 */
export function fieldTypesForSelection(
  category: EventCategory | null,
  subcategory: string | null,
): string[] {
  if (subcategory && SUBCATEGORY_FIELD_TYPES[subcategory]) {
    return SUBCATEGORY_FIELD_TYPES[subcategory];
  }
  if (category) return CATEGORY_FIELD_TYPES[category] ?? [];
  return [];
}

/**
 * Wartość `sport_filter` do RPC mapowych (fields_in_bbox, event_counts_in_bbox,
 * voivodeship_field_counts). null = wszystkie obiekty.
 */
/** Mapuje `fields.sport` na podkategorię wydarzenia sportowego (np. basketball → basketball). */
export function eventSubcategoryForFieldSport(sport: string | null): string | null {
  if (!sport) return null;
  for (const [sub, types] of Object.entries(SUBCATEGORY_FIELD_TYPES)) {
    if (types.includes(sport)) return sub;
  }
  return null;
}

/** Czy boisko pasuje do wybranej kategorii/podkategorii wydarzenia. */
export function fieldSportMatchesEvent(
  fieldSport: string | null,
  category: EventCategory | null,
  subcategory: string | null,
): boolean {
  if (!fieldSport) return true;
  const allowed = fieldTypesForSelection(category, subcategory);
  if (allowed.length === 0) return true;
  return allowed.includes(fieldSport);
}

export function fieldFilterForSelection(
  category: CategoryFilter,
  subcategory: string | null,
): { rpc: string | null; showFields: boolean } {
  if (subcategory && SUBCATEGORY_FIELD_TYPES[subcategory]) {
    return { rpc: SUBCATEGORY_FIELD_TYPES[subcategory].join(','), showFields: true };
  }
  if (category === 'all') return { rpc: null, showFields: true };
  const types = CATEGORY_FIELD_TYPES[category as EventCategory] ?? [];
  if (types.length === 0) return { rpc: null, showFields: false };
  return { rpc: types.join(','), showFields: true };
}
