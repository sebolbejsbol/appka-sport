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
  /** Uczestnicy najbliższego zaplanowanego eventu na tym boisku (dociągane po stronie mapy). */
  players_current?: number;
  players_max?: number | null;
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
/** Pobiera konkretne boiska po id, niezależnie od bbox/filtra sportu (np. ulubione). */
export async function getFieldsByIds(
  ids: string[],
): Promise<{ data: FieldPoint[]; error: { message: string } | null }> {
  if (ids.length === 0) return { data: [], error: null };
  const { data, error } = await supabase.rpc('fields_by_ids', { p_ids: ids });
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

/** Granica zablokowanego (jeszcze niedostępnego) województwa — prawdziwy poligon. */
export type LockedVoivodeship = {
  voivodeship: string;
  geometry: GeoJSON.Geometry;
};

/**
 * Granice województw poza aktywnym obszarem (domyślnie poza Trójmiastem /
 * pomorskie) — do narysowania szarej nakładki "Coming soon" na mapie.
 * Apka rusza tylko w Trójmieście na razie (patrz PLAN.md); reszta kraju
 * zostaje w kodzie/bazie gotowa, tylko wizualnie zablokowana.
 */
export async function getLockedVoivodeshipBoundaries(
  activeVoivodeship = 'pomorskie',
): Promise<{ data: LockedVoivodeship[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('locked_voivodeship_boundaries', {
    p_active_voivodeship: activeVoivodeship,
  });
  const rows = (data as { voivodeship: string; geojson: string }[] | null) ?? [];
  return {
    data: rows.flatMap((r) => {
      try {
        return [{ voivodeship: r.voivodeship, geometry: JSON.parse(r.geojson) as GeoJSON.Geometry }];
      } catch {
        return [];
      }
    }),
    error,
  };
}

/** GeoJSON FeatureCollection z zablokowanych województw, do FillLayer/LineLayer. */
export function lockedVoivodeshipsToGeoJSON(rows: LockedVoivodeship[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      properties: { voivodeship: r.voivodeship },
      geometry: r.geometry,
    })),
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

/** Status dostępności boiska do kolorowania odznaki na mapie (zielony/pomarańczowy/szary). */
export type CourtAvailability = 'empty' | 'open' | 'full';

function courtAvailability(playersCurrent: number, playersMax: number | null | undefined): CourtAvailability {
  if (playersCurrent <= 0 && playersMax == null) return 'empty';
  if (playersMax != null && playersCurrent >= playersMax) return 'full';
  return 'open';
}

/** Etykieta „aktualni/max" na odznace boiska (np. „6/10", „3", „—"). */
function playersLabel(playersCurrent: number, playersMax: number | null | undefined): string {
  if (playersCurrent <= 0 && playersMax == null) return '';
  if (playersMax != null) return `${playersCurrent}/${playersMax}`;
  return String(playersCurrent);
}

export function fieldsToGeoJSON(fields: FieldPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: fields.map((f) => {
      const event_count = Number(f.event_count ?? 0);
      const badge_icon = `badge-${Math.min(Math.max(event_count, 0), 20)}`;
      const playersCurrent = f.players_current ?? 0;
      const playersMax = f.players_max ?? null;
      const availability = courtAvailability(playersCurrent, playersMax);
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
          count_label: playersLabel(playersCurrent, playersMax),
          players_current: playersCurrent,
          players_max: playersMax ?? -1,
          availability,
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
