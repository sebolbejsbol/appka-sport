import type { CourtAvailability } from '@/lib/court-availability';
import { distanceMeters } from '@/lib/geo';

/**
 * Minimalny kształt boiska potrzebny do scalania — nie importujemy pełnego
 * FieldPoint z fields.ts, żeby ten moduł (jak court-availability.ts) dało
 * się testować bez skonfigurowanego środowiska Supabase.
 */
export type DedupableField = {
  id: string;
  name: string | null;
  sport: string | null;
  lng: number;
  lat: number;
  event_count: number;
  availability?: CourtAvailability;
};

/**
 * Boiska tego samego sportu leżące bliżej siebie niż to uznajemy za JEDNO
 * fizyczne miejsce (np. teren rekreacyjny zmapowany w OSM jako kilka
 * osobnych węzłów tej samej strefy/urządzenia) — bez scalania każdy taki
 * węzeł dostaje własny bąbel tuż obok pozostałych, co przy bliższym zoomie
 * (poza zasięgiem klastrowania Mapboxa) robi bałagan zamiast jednego
 * czytelnego punktu.
 */
const DEDUPE_DISTANCE_METERS = 25;

/**
 * Kategorie traktowane jako "ten sam sport" wyłącznie na potrzeby scalania —
 * te same pary co w clusterSportCondition() w map-theme.ts (siłownia plenerowa
 * w OSM bywa tagowana jako `outdoor_gym`, ale wizualnie/funkcjonalnie to
 * "fitness"). Bez tego dwa węzły tej samej strefy z różnym tagiem OSM nigdy
 * by się nie scaliły, mimo że stoją metr od siebie.
 */
const SPORT_EQUIVALENCE_GROUPS: readonly (readonly string[])[] = [['fitness', 'outdoor_gym']];

function canonicalSport(sport: string | null): string | null {
  if (sport == null) return null;
  for (const group of SPORT_EQUIVALENCE_GROUPS) {
    if (group.includes(sport)) return group[0];
  }
  return sport;
}

const AVAILABILITY_PRIORITY: Record<CourtAvailability, number> = {
  open: 3,
  filling: 2,
  full: 1,
  empty: 0,
};

function bestAvailability(
  a: CourtAvailability | undefined,
  b: CourtAvailability | undefined,
): CourtAvailability | undefined {
  if (!a) return b;
  if (!b) return a;
  return AVAILABILITY_PRIORITY[a] >= AVAILABILITY_PRIORITY[b] ? a : b;
}

/**
 * Union-find po indeksach — grupuje TRANZYTYWNIE (A blisko B, B blisko C ->
 * A/B/C w jednej grupie, nawet jeśli A i C same w sobie są dalej niż próg),
 * żeby rząd kilku węzłów tej samej instalacji zlał się w jeden punkt zamiast
 * rozpaść na kilka mniejszych par.
 */
export function dedupeNearbyFields<T extends DedupableField>(fields: T[]): T[] {
  const n = fields.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (canonicalSport(fields[i].sport) !== canonicalSport(fields[j].sport)) continue;
      const dist = distanceMeters([fields[i].lng, fields[i].lat], [fields[j].lng, fields[j].lat]);
      if (dist <= DEDUPE_DISTANCE_METERS) union(i, j);
    }
  }

  const groups = new Map<number, T[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(fields[i]);
    else groups.set(root, [fields[i]]);
  }

  const result: T[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    // Nazwany węzeł jako reprezentant (czytelniejszy w arkuszu szczegółów) niż anonimowy.
    const representative = group.find((f) => f.name) ?? group[0];
    const event_count = group.reduce((sum, f) => sum + (f.event_count ?? 0), 0);
    const availability = group.reduce<CourtAvailability | undefined>(
      (best, f) => bestAvailability(best, f.availability),
      undefined,
    );
    result.push({ ...representative, event_count, availability });
  }
  return result;
}
