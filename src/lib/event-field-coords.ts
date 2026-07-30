import { getFieldsInBbox, type Bbox } from '@/lib/fields';
import { POLAND_BBOX } from '@/lib/map-bbox';
import type { EventListItem } from '@/lib/events';

type FieldCoord = { lng: number; lat: number };

let cachedCoords = new Map<string, FieldCoord>();
let cacheAt = 0;
const CACHE_MS = 5 * 60 * 1000;

async function loadFieldCoords(bbox: Bbox = POLAND_BBOX): Promise<Map<string, FieldCoord>> {
  if (Date.now() - cacheAt < CACHE_MS && cachedCoords.size > 0) {
    return cachedCoords;
  }

  const { data } = await getFieldsInBbox(bbox, 2000, null);
  const map = new Map<string, FieldCoord>();
  for (const field of data) {
    map.set(field.id, { lng: field.lng, lat: field.lat });
  }

  cachedCoords = map;
  cacheAt = Date.now();
  return map;
}

export async function enrichEventsWithFieldCoords(
  items: EventListItem[],
): Promise<EventListItem[]> {
  if (items.length === 0) return items;

  const needsCoords = items.some((e) => e.field_lng == null || e.field_lat == null);
  if (!needsCoords) return items;

  const coordsByField = await loadFieldCoords();

  return items.map((item) => {
    if (item.field_lng != null && item.field_lat != null) return item;
    const coords = coordsByField.get(item.field_id);
    if (!coords) return item;
    return {
      ...item,
      field_lng: coords.lng,
      field_lat: coords.lat,
    };
  });
}

export function invalidateFieldCoordsCache(): void {
  cachedCoords = new Map();
  cacheAt = 0;
}
