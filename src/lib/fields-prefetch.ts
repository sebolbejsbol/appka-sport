import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getEventCountsInBbox,
  getFieldsInBbox,
  type FieldPoint,
} from '@/lib/fields';
import { markInitialFieldsReady } from '@/lib/map-ready';
import { POLAND_BBOX } from '@/lib/map-bbox';
import { fieldFilterForSelection } from '@/lib/venue-types';

/**
 * Preładowanie boisk CAŁEGO Trójmiasta (jedyny odblokowany region — serwer i
 * tak filtruje fields_in_bbox/event_counts_in_bbox do tego regionu niezależnie
 * od przekazanego bbox, więc jedno szerokie zapytanie wystarcza) w tle, zanim
 * użytkownik w ogóle dotrze do ekranu mapy. Startuje najwcześniej jak się da
 * (patrz wywołanie w src/app/_layout.tsx) — równolegle z resztą inicjalizacji
 * apki, zamiast dopiero po zamontowaniu AppMap.
 *
 * Dwuwarstwowy cache:
 * 1. AsyncStorage (przetrwa restart apki) — czytany od razu przy starcie,
 *    daje NATYCHMIASTOWY pierwszy render przy kolejnych otwarciach apki.
 * 2. Świeże zapytanie sieciowe zawsze leci równolegle i nadpisuje wynik
 *    (cache to tylko przyspieszenie pierwszego malowania, nie prawda ostateczna).
 */

const STORAGE_KEY = '@appka-sport/fields-prefetch-cache-v1';
const PREFETCH_ROW_CAP = 2000;

type Listener = (fields: FieldPoint[]) => void;

let memoryCache: FieldPoint[] | null = null;
let started = false;
const listeners = new Set<Listener>();

/** Ten sam filtr co domyślny widok mapy (kategoria 'sport', bez podkategorii) — patrz DEFAULT_DISCOVER_FILTERS. */
const DEFAULT_SPORT_RPC_FILTER = fieldFilterForSelection('sport', null).rpc;

function notify(fields: FieldPoint[]) {
  memoryCache = fields;
  for (const cb of listeners) cb(fields);
}

async function readFromStorage(): Promise<FieldPoint[] | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fields?: FieldPoint[] };
    return Array.isArray(parsed.fields) ? parsed.fields : null;
  } catch {
    return null;
  }
}

async function writeToStorage(fields: FieldPoint[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ fields, savedAt: Date.now() }));
  } catch {
    // brak zapisu nie blokuje korzystania z apki — po prostu następny start
    // znowu wystartuje bez cache'u z dysku
  }
}

async function fetchFresh(): Promise<FieldPoint[] | null> {
  const [fieldsRes, countsRes] = await Promise.all([
    getFieldsInBbox(POLAND_BBOX, PREFETCH_ROW_CAP, DEFAULT_SPORT_RPC_FILTER, 'default'),
    getEventCountsInBbox(POLAND_BBOX, DEFAULT_SPORT_RPC_FILTER),
  ]);
  if (fieldsRes.error) return null;
  const counts = countsRes.error ? new Map() : countsRes.data;
  return fieldsRes.data.map((field) => {
    const stats = counts.get(field.id);
    return { ...field, event_count: stats?.event_count ?? 0, availability: stats?.availability };
  });
}

/**
 * Startuje preładowanie — bezpieczne do wywołania wielokrotnie (no-op po
 * pierwszym razie). Nie blokuje callera: zarówno odczyt z dysku, jak i
 * zapytanie sieciowe lecą w tle, a wyniki trafiają do subskrybentów przez
 * onFieldsPrefetchUpdate/getPrefetchedFields.
 */
export function primeFieldsPrefetch(): void {
  if (started) return;
  started = true;

  void (async () => {
    const cached = await readFromStorage();
    if (cached && cached.length > 0) notify(cached);

    const fresh = await fetchFresh();
    if (fresh) {
      notify(fresh);
      void writeToStorage(fresh);
    }
    // Nawet przy błędzie sieci liczy się jako "gotowe" — mamy już co pokazać
    // (cache) albo wiadomo, że trzeba pokazać pusty/błędny stan, zamiast
    // trzymać splash w nieskończoność.
    markInitialFieldsReady();
  })();
}

/** Odczyt synchroniczny — dane z ostatniego cache/fetch, jeśli już dostępne. */
export function getPrefetchedFields(): FieldPoint[] | null {
  return memoryCache;
}

/**
 * Subskrybuje kolejne aktualizacje preładowanych boisk (najpierw ewentualny
 * dyskowy cache, potem świeży fetch). Jeśli dane już są, wywołuje callback
 * od razu. Zwraca funkcję czyszczącą subskrypcję.
 */
export function onFieldsPrefetchUpdate(cb: Listener): () => void {
  if (memoryCache) cb(memoryCache);
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
