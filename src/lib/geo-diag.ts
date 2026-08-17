/**
 * TYMCZASOWY moduł diagnostyczny (2026-08-17) — do usunięcia po ustaleniu
 * realnej przyczyny problemów z lokalizacją zgłaszanych przez userów.
 *
 * Jeden wspólny pierścieniowy bufor zdarzeń, którego używa CAŁA ścieżka
 * lokalizacyjna (get-web-location.ts, use-user-location.ts,
 * use-watching-location.ts, event/[id].tsx, field-navigation.ts,
 * map-view.web.tsx) — każdy krok od kliknięcia akcji do wyrenderowania
 * lokalizacji na mapie loguje się tutaj z timestampem. `console.warn` dla
 * widoczności w devtools/zdalnym debugowaniu, PLUS bufor odczytywalny przez
 * getGeoDiagTrail() do wklejenia bezpośrednio w komunikat błędu w UI — user
 * nie musi mieć podłączonego Maca/PC, wystarczy zrzut ekranu.
 */

type DiagEntry = { t: number; stage: string; detail?: string };

const MAX_ENTRIES = 40;
const buffer: DiagEntry[] = [];

export function geoDiag(stage: string, detail?: Record<string, unknown> | string) {
  const detailStr =
    typeof detail === 'string' ? detail : detail ? safeStringify(detail) : undefined;
  buffer.push({ t: Date.now(), stage, detail: detailStr });
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  console.warn(`[geo] ${stage}`, detail ?? '');
}

function safeStringify(obj: Record<string, unknown>): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

/** Ostatnie N zdarzeń jako czytelny tekst — do wklejenia w komunikat błędu w UI. */
export function getGeoDiagTrail(lastN = 8): string {
  const start = Date.now();
  return buffer
    .slice(-lastN)
    .map((e) => `+${start - e.t}ms ${e.stage}${e.detail ? ` ${e.detail}` : ''}`)
    .join(' | ');
}

export function clearGeoDiag() {
  buffer.length = 0;
}
