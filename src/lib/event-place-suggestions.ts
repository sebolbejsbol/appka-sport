import type { EventCategory } from '@/lib/event-categories';
import { formatFieldTitle } from '@/lib/field-display';
import { getFieldsInBbox } from '@/lib/fields';
import { distanceMeters, type LngLat } from '@/lib/geo';
import { bboxAroundCenter } from '@/lib/map-bbox';
import { searchMapPlaces } from '@/lib/map-geocoding';
import { fieldTypesForSelection } from '@/lib/venue-types';

/** Ujednolicone miejsce do wyboru w kreatorze wydarzenia. */
export type EventPlace = {
  id: string;
  label: string;
  subtitle: string | null;
  center: LngLat;
  /** Źródło: boisko z naszej bazy lub wynik geokodowania (adres/POI). */
  source: 'field' | 'geo';
  /** Powiązane boisko (gdy źródłem jest nasza baza) — do podpięcia w evencie. */
  fieldId: string | null;
  sport: string | null;
  distanceM: number | null;
};

function fieldToPlace(
  field: { id: string; name: string | null; sport: string | null; lng: number; lat: number },
  center: LngLat | null,
): EventPlace {
  const label = formatFieldTitle({ osmName: field.name, sport: field.sport });
  const dist = center ? distanceMeters(center, [field.lng, field.lat]) : null;
  return {
    id: `field:${field.id}`,
    label,
    subtitle: null,
    center: [field.lng, field.lat],
    source: 'field',
    fieldId: field.id,
    sport: field.sport,
    distanceM: dist,
  };
}

/**
 * Pobiera pobliskie obiekty pasujące do kategorii/podkategorii wydarzenia
 * (posortowane od najbliższych), gotowe jako proponowane miejsca.
 * Np. badminton → korty do badmintona, teatr → teatry, koncert → kluby/sale.
 * Pusta lista, gdy dany typ wydarzenia nie ma dedykowanych obiektów.
 */
export async function loadFieldSuggestions(
  center: LngLat,
  category: EventCategory,
  subcategory: string | null,
  limit = 40,
): Promise<EventPlace[]> {
  const types = fieldTypesForSelection(category, subcategory);
  if (types.length === 0) return [];

  const bbox = bboxAroundCenter(center, 11);
  const { data } = await getFieldsInBbox(bbox, 300, types.join(','), 'default');
  return data
    .map((field) => fieldToPlace(field, center))
    .sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
    .slice(0, limit);
}

/**
 * Wyszukiwanie miejsc dla kreatora: najpierw dopasowane boiska z naszej bazy
 * (zgodne z podkategorią), potem wyniki geokodowania (adresy/POI).
 */
export async function searchEventPlaces(
  query: string,
  cachedFields: EventPlace[],
): Promise<{ data: EventPlace[]; error: boolean }> {
  const q = query.trim().toLowerCase();

  const fieldMatches = q
    ? cachedFields.filter((p) => p.label.toLowerCase().includes(q))
    : cachedFields;

  const { data: geo, error } = await searchMapPlaces(query);
  const geoPlaces: EventPlace[] = geo.map((g) => ({
    id: `geo:${g.id}`,
    label: g.label,
    subtitle: g.subtitle,
    center: g.center,
    source: 'geo',
    fieldId: null,
    sport: null,
    distanceM: null,
  }));

  // Boiska najpierw (max 8), potem geokodowanie — bez duplikatów po etykiecie.
  const seen = new Set<string>();
  const merged: EventPlace[] = [];
  for (const place of [...fieldMatches.slice(0, 8), ...geoPlaces]) {
    const key = place.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }

  return { data: merged, error };
}
