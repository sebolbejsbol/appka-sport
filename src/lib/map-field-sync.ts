/** Synchronizacja liczników eventów na mapie po utworzeniu / usunięciu eventu. */

type CountListener = (fieldId: string, delta: number) => void;
type RefreshListener = () => void;

const countListeners = new Set<CountListener>();
const refreshListeners = new Set<RefreshListener>();
const favoritesRefreshListeners = new Set<RefreshListener>();

export function onFieldEventCountChange(listener: CountListener): () => void {
  countListeners.add(listener);
  return () => countListeners.delete(listener);
}

export function onMapFieldsRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

export function onFavoritesRefresh(listener: RefreshListener): () => void {
  favoritesRefreshListeners.add(listener);
  return () => favoritesRefreshListeners.delete(listener);
}

/** Natychmiastowa zmiana licznika na kropce (+1 / -1). */
export function notifyFieldEventCountDelta(fieldId: string, delta: number): void {
  for (const listener of countListeners) {
    listener(fieldId, delta);
  }
}

/** Pełne przeładowanie widocznych boisk (np. po powrocie na mapę) — ciężkie:
 * discover eventy + cały bbox od nowa. Używać tylko gdy dane BOISK/EVENTÓW
 * realnie się zmieniły (nowy event, edycja boiska w adminie), nie do drobnych
 * lokalnych akcji jak ulubione — patrz requestFavoritesRefresh(). */
export function requestMapFieldsRefresh(): void {
  for (const listener of refreshListeners) {
    listener();
  }
}

/** Lekkie odświeżenie — wymusza tylko ponowne wczytanie ulubionych i
 * republikację features z istniejącego cache, bez refetchu discover
 * eventów ani całego bbox. Ulubione nie zmieniają danych boisk/eventów,
 * więc pełny requestMapFieldsRefresh() byłby tu marnotrawstwem (i widocznym,
 * chaotycznym przeładowaniem całej mapy pod otwartym arkuszem szczegółów). */
export function requestFavoritesRefresh(): void {
  for (const listener of favoritesRefreshListeners) {
    listener();
  }
}
