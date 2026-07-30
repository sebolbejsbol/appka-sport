import { fieldMarkerColor, fieldMarkerEmoji, fieldMarkerIcon } from '@/lib/sports';
import { supabase } from '@/lib/supabase';

/** Pojedyncze boisko zwrócone przez funkcję bazodanową fields_in_bbox. */
export type FieldPoint = {
  id: string;
  name: string | null;
  sport: string | null;
  lng: number;
  lat: number;
  event_count: number;
  avg_rating: number | null;
  rating_count: number;
};

export type FieldSort = 'default' | 'rating';

export type Bbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

/**
 * Pobiera boiska widoczne w danym prostokącie mapy (viewport).
 * Domyślnie koszykówka: boiska z koszem, orliki (multi) i place zabaw.
 */
export async function getFieldsInBbox(
  bbox: Bbox,
  maxRows?: number,
  sport: string | null = 'basketball',
  sort: FieldSort = 'default',
): Promise<{ data: FieldPoint[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('fields_in_bbox', {
    min_lng: bbox.minLng,
    min_lat: bbox.minLat,
    max_lng: bbox.maxLng,
    max_lat: bbox.maxLat,
    max_rows: maxRows,
    sport_filter: sport,
    sort_by: sort,
  });

  const rows = (data as Omit<FieldPoint, 'event_count'>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      ...row,
      event_count: 0,
      avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      rating_count: Number(row.rating_count) || 0,
    })),
    error,
  };
}

export async function getEventCountsInBbox(
  bbox: Bbox,
  sport: string | null = 'basketball',
): Promise<{ data: Map<string, number>; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('event_counts_in_bbox', {
    min_lng: bbox.minLng,
    min_lat: bbox.minLat,
    max_lng: bbox.maxLng,
    max_lat: bbox.maxLat,
    sport_filter: sport,
  });

  const map = new Map<string, number>();
  for (const row of (data as { field_id: string; event_count: number }[] | null) ?? []) {
    map.set(row.field_id, Number(row.event_count) || 0);
  }
  return { data: map, error };
}

export type VoivodeshipStat = {
  voivodeship: string;
  court_count: number;
  lng: number;
  lat: number;
};

/**
 * Statystyki boisk per województwo (do bąbli przy pełnym oddaleniu).
 * `sport` filtruje dyscyplinę (null = wszystkie), dzięki czemu liczby na bąblach
 * zmieniają się przy przełączaniu kategorii sportu.
 */
export async function getVoivodeshipStats(sport: string | null = null): Promise<{
  data: VoivodeshipStat[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('voivodeship_field_counts', {
    sport_filter: sport,
  });

  const rows = (data as VoivodeshipStat[] | null) ?? [];
  return {
    data: rows.map((r) => ({
      voivodeship: r.voivodeship,
      court_count: Number(r.court_count) || 0,
      lng: Number(r.lng),
      lat: Number(r.lat),
    })),
    error,
  };
}

const VOIVODESHIP_COUNT_CAP = 2000;

/** Skraca duże liczby na bąblu, np. 5421 → „2000+", żeby było czytelnie. */
export function formatBubbleCount(count: number): string {
  return count > VOIVODESHIP_COUNT_CAP ? `${VOIVODESHIP_COUNT_CAP}+` : String(count);
}

/** GeoJSON z bąbli województw (1 punkt = 1 województwo). */
export function voivodeshipsToGeoJSON(rows: VoivodeshipStat[]) {
  return {
    type: 'FeatureCollection' as const,
    features: rows.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
      properties: {
        voivodeship: r.voivodeship,
        court_count: r.court_count,
        count_label: formatBubbleCount(r.court_count),
        label: capitalizePl(r.voivodeship),
      },
    })),
  };
}

function capitalizePl(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fieldsToGeoJSON(fields: FieldPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: fields.map((f) => {
      const event_count = Number(f.event_count ?? 0);
      const badge_icon = `badge-${Math.min(Math.max(event_count, 0), 20)}`;
      return {
        type: 'Feature' as const,
        id: f.id,
        properties: {
          id: f.id,
          name: f.name,
          sport: f.sport,
          event_count,
          badge_icon,
          color: fieldMarkerColor(f.sport),
          emoji: fieldMarkerEmoji(f.sport),
          icon: fieldMarkerIcon(f.sport),
          count_label: event_count > 99 ? '99+' : String(event_count),
          avg_rating: f.avg_rating ?? 0,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [f.lng, f.lat],
        },
      };
    }),
  };
}

/** Odtwarza FieldPoint z klikniętej kropki na mapie. */
export function fieldFromMapFeature(feature: GeoJSON.Feature): FieldPoint | null {
  const props = feature.properties;
  const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
  if (!props || !coords || coords.length < 2) return null;

  const id = String(props.id ?? feature.id ?? '');
  if (!id) return null;

  return {
    id,
    name: props.name != null ? String(props.name) : null,
    sport: props.sport != null ? String(props.sport) : null,
    lng: Number(coords[0]),
    lat: Number(coords[1]),
    event_count: Number(props.event_count ?? 0),
    avg_rating: props.avg_rating != null ? Number(props.avg_rating) : null,
    rating_count: Number(props.rating_count ?? 0),
  };
}
