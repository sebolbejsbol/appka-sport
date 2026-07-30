/** Synchronizacja liczników eventów na mapie po utworzeniu / usunięciu eventu. */

type CountListener = (fieldId: string, delta: number) => void;
type RefreshListener = () => void;

const countListeners = new Set<CountListener>();
const refreshListeners = new Set<RefreshListener>();

export function onFieldEventCountChange(listener: CountListener): () => void {
  countListeners.add(listener);
  return () => countListeners.delete(listener);
}

export function onMapFieldsRefresh(listener: RefreshListener): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

/** Natychmiastowa zmiana licznika na kropce (+1 / -1). */
export function notifyFieldEventCountDelta(fieldId: string, delta: number): void {
  for (const listener of countListeners) {
    listener(fieldId, delta);
  }
}

/** Pełne przeładowanie widocznych boisk (np. po powrocie na mapę). */
export function requestMapFieldsRefresh(): void {
  for (const listener of refreshListeners) {
    listener();
  }
}
