import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getEventCountsInBbox,
  getFieldsInBbox,
  type Bbox,
  type FieldPoint,
} from '@/lib/fields';
import { markInitialFieldsReady } from '@/lib/map-ready';
import { POLAND_BBOX } from '@/lib/map-bbox';
import { fieldFilterForSelection } from '@/lib/venue-types';

/**
 * Preładowanie boisk regionu w tle, zanim użytkownik w ogóle dotrze do
 * ekranu mapy. Startuje najwcześniej jak się da (patrz wywołanie w
 * src/app/_layout.tsx) — równolegle z resztą inicjalizacji apki, zamiast
 * dopiero po zamontowaniu AppMap.
 *
 * Dwuwarstwowy cache, PER REGION (dziś tylko Trójmiasto — jedyny odblokowany
 * region — ale REGIONS poniżej jest tablicą właśnie po to, żeby dodanie
 * kolejnego miasta było nowym wpisem, a nie przepisywaniem tego modułu):
 * 1. AsyncStorage (przetrwa restart apki) — czytany od razu przy starcie,
 *    daje NATYCHMIASTOWY pierwszy render przy kolejnych otwarciach apki.
 * 2. Świeże zapytanie sieciowe leci w tle TYLKO gdy dyskowy cache jest
 *    starszy niż CACHE_TTL_MS (lista boisk dla danego regionu jest z
 *    założenia prawie statyczna — nie ma sensu odpytywać serwera przy
 *    każdym starcie apki, patrz zadanie „zbyt wolne ładowanie boisk").
 *    Wewnątrz TTL cache jest traktowany jako prawda ostateczna i splash
 *    zwalnia się bez czekania na sieć w ogóle.
 */

const STORAGE_KEY_PREFIX = '@appka-sport/fields-prefetch-cache-v2/';
const PREFETCH_ROW_CAP = 2000;
/** Lista boisk w regionie zmienia się rzadko (nowe boisko od admina to wyjątek,
 * nie reguła) — 12h równoważy „nie odpytuj za każdym razem" z tym, żeby
 * nowo dodane boiska pojawiły się bez ręcznego czyszczenia cache/reinstalu. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type FieldRegion = {
  id: string;
  /** Bbox przekazywany do fields_in_bbox/event_counts_in_bbox — serwer i tak
   * dodatkowo filtruje do odblokowanego regionu, ale trzymamy to per-region,
   * żeby dla kolejnych miast dało się zawęzić zapytanie do ich bboxa. */
  bbox: Bbox;
};

/** Jedyny aktywny region dziś. Dodanie miasta = nowy wpis tutaj, reszta modułu bez zmian. */
const REGIONS: FieldRegion[] = [{ id: 'tricity', bbox: POLAND_BBOX }];

type RegionCacheEntry = { fields: FieldPoint[]; savedAt: number };

type Listener = (fields: FieldPoint[]) => void;

const regionCaches = new Map<string, RegionCacheEntry>();
let started = false;
let pendingRegions = 0;
const listeners = new Set<Listener>();

/** Ten sam filtr co domyślny widok mapy (kategoria 'sport', bez podkategorii) — patrz DEFAULT_DISCOVER_FILTERS. */
export const DEFAULT_SPORT_RPC_FILTER = fieldFilterForSelection('sport', null).rpc;
const DEFAULT_SPORT_TYPES = new Set((DEFAULT_SPORT_RPC_FILTER ?? '').split(',').filter(Boolean));

function allFields(): FieldPoint[] {
  const out: FieldPoint[] = [];
  for (const entry of regionCaches.values()) out.push(...entry.fields);
  return out;
}

function notify() {
  const combined = allFields();
  for (const cb of listeners) cb(combined);
}

function storageKey(regionId: string): string {
  return `${STORAGE_KEY_PREFIX}${regionId}`;
}

async function readFromStorage(regionId: string): Promise<RegionCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(regionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fields?: FieldPoint[]; savedAt?: number };
    if (!Array.isArray(parsed.fields)) return null;
    return { fields: parsed.fields, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

async function writeToStorage(regionId: string, entry: RegionCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(regionId), JSON.stringify(entry));
  } catch {
    // brak zapisu nie blokuje korzystania z apki — po prostu następny start
    // znowu wystartuje bez cache'u z dysku
  }
}

async function fetchFreshForRegion(region: FieldRegion): Promise<FieldPoint[] | null> {
  const [fieldsRes, countsRes] = await Promise.all([
    getFieldsInBbox(region.bbox, PREFETCH_ROW_CAP, DEFAULT_SPORT_RPC_FILTER, 'default'),
    getEventCountsInBbox(region.bbox, DEFAULT_SPORT_RPC_FILTER),
  ]);
  if (fieldsRes.error) return null;
  const counts = countsRes.error ? new Map() : countsRes.data;
  return fieldsRes.data.map((field) => {
    const stats = counts.get(field.id);
    return { ...field, event_count: stats?.event_count ?? 0, availability: stats?.availability };
  });
}

async function primeRegion(region: FieldRegion): Promise<void> {
  const cached = await readFromStorage(region.id);
  const isFresh = !!cached && Date.now() - cached.savedAt < CACHE_TTL_MS;

  if (cached) {
    regionCaches.set(region.id, cached);
    notify();
  }

  // Cache na dysku jest jeszcze świeży (< CACHE_TTL_MS) — traktujemy go jako
  // prawdę ostateczną i NIE odpytujemy sieci wcale. To jest właściwa zmiana
  // za „nie ma potrzeby pobierać jej za każdym razem od nowa": zimny start z
  // ciepłym cache'em kończy preładowanie od razu po odczycie z dysku (rzędu
  // pojedynczych ms), zamiast czekać na round-trip do serwera.
  if (isFresh) return;

  const fresh = await fetchFreshForRegion(region);
  if (fresh) {
    const entry: RegionCacheEntry = { fields: fresh, savedAt: Date.now() };
    regionCaches.set(region.id, entry);
    notify();
    void writeToStorage(region.id, entry);
  }
}

/**
 * Startuje preładowanie wszystkich aktywnych regionów — bezpieczne do
 * wywołania wielokrotnie (no-op po pierwszym razie). Nie blokuje callera:
 * zarówno odczyt z dysku, jak i ewentualne zapytanie sieciowe lecą w tle, a
 * wyniki trafiają do subskrybentów przez onFieldsPrefetchUpdate/getPrefetchedFields.
 */
export function primeFieldsPrefetch(): void {
  if (started) return;
  started = true;
  pendingRegions = REGIONS.length;

  for (const region of REGIONS) {
    void primeRegion(region).finally(() => {
      pendingRegions -= 1;
      // "Gotowe" liczy się dopiero, gdy KAŻDY region skończył (sukces, cache
      // albo błąd sieci) — inaczej splash zwolniłby się zanim wolniejszy
      // region w ogóle zdążył cokolwiek zwrócić.
      if (pendingRegions <= 0) markInitialFieldsReady();
    });
  }
}

/** Wymusza pominięcie TTL przy następnym starcie apki dla danego regionu (albo wszystkich, jeśli pominięty) — np. po dodaniu boiska przez admina. */
export async function invalidateFieldsPrefetchCache(regionId?: string): Promise<void> {
  const ids = regionId ? [regionId] : REGIONS.map((r) => r.id);
  await Promise.all(ids.map((id) => AsyncStorage.removeItem(storageKey(id))));
}

/** Odczyt synchroniczny — dane z ostatniego cache/fetch (wszystkie regiony razem), jeśli już dostępne. */
export function getPrefetchedFields(): FieldPoint[] | null {
  if (regionCaches.size === 0) return null;
  return allFields();
}

/**
 * Subskrybuje kolejne aktualizacje preładowanych boisk (najpierw ewentualny
 * dyskowy cache, potem świeży fetch, jeśli TTL wygasł). Jeśli dane już są,
 * wywołuje callback od razu. Zwraca funkcję czyszczącą subskrypcję.
 */
export function onFieldsPrefetchUpdate(cb: Listener): () => void {
  const current = getPrefetchedFields();
  if (current) cb(current);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Czy `rpcFilter` (string przekazywany do fields_in_bbox jako sport_filter)
 * jest w pełni pokryty przez to, co preładowanie już pobrało — czyli czy
 * można obsłużyć żądanie FILTRUJĄC CACHE PO STRONIE KLIENTA zamiast pytać
 * serwer od nowa. `null` (kategorie spoza sportu, np. „wszystko"/hobby) NIE
 * jest pokryty, bo prefetch celowo ciągnie tylko typy sportowe.
 */
export function isSportFilterCoveredByPrefetch(rpcFilter: string | null): boolean {
  if (!rpcFilter) return false;
  return rpcFilter
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((type) => DEFAULT_SPORT_TYPES.has(type));
}

/**
 * Filtruje preładowane boiska po bboxie + typie sportu, bez sieci — do
 * użycia przez mapę zamiast getFieldsInBbox, kiedy isSportFilterCoveredByPrefetch
 * potwierdza, że wybrany filtr mieści się w tym, co prefetch pobrał. Zwraca
 * `null`, gdy nie ma jeszcze żadnych danych (jeszcze przed pierwszym
 * odczytem z dysku/sieci) — wtedy caller ma polecieć po sieć jak dotychczas.
 */
export function filterPrefetchedFields(
  bbox: Bbox,
  rpcFilter: string | null,
  maxRows: number,
): FieldPoint[] | null {
  const fields = getPrefetchedFields();
  if (!fields) return null;

  const types = rpcFilter
    ? new Set(rpcFilter.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  const matched: FieldPoint[] = [];
  for (const f of fields) {
    if (f.lng < bbox.minLng || f.lng > bbox.maxLng || f.lat < bbox.minLat || f.lat > bbox.maxLat) {
      continue;
    }
    if (types) {
      const sport = f.sport ?? '';
      const first = sport.split(';')[0]?.trim() ?? '';
      if (!types.has(first) && !types.has(sport)) continue;
    }
    matched.push(f);
    if (matched.length >= maxRows) break;
  }
  return matched;
}
