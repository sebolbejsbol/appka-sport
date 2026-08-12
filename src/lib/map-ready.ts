type Listener = () => void;

// Stan modułu — resetuje się tylko przy pełnym przeładowaniu apki, co jest
// dokładnie tym, czego potrzebujemy: sygnał ma dotyczyć wyłącznie pierwszego
// ładowania mapy po starcie, nie kolejnych zamontowań ekranu.
let fieldsReady = false;
let discoverReady = false;
let notified = false;
let listener: Listener | null = null;

function maybeNotify() {
  if (notified || !fieldsReady || !discoverReady) return;
  notified = true;
  listener?.();
}

/** Wywoływane przez mapę po zakończeniu (sukces lub błąd) pierwszego ładowania boisk. */
export function markInitialFieldsReady(): void {
  fieldsReady = true;
  maybeNotify();
}

/** Wywoływane przez mapę po zakończeniu (sukces lub błąd) pierwszego ładowania eventów. */
export function markInitialDiscoverReady(): void {
  discoverReady = true;
  maybeNotify();
}

export function isInitialMapDataReady(): boolean {
  return notified;
}

/**
 * Subskrybuje moment, w którym mapa ma już załadowane pierwsze boiska i eventy.
 * Jeśli to już nastąpiło, wywołuje callback od razu (synchronicznie).
 * Zwraca funkcję czyszczącą subskrypcję.
 */
export function onInitialMapDataReady(cb: Listener): () => void {
  if (notified) {
    cb();
    return () => {};
  }
  listener = cb;
  return () => {
    if (listener === cb) listener = null;
  };
}
