/**
 * Status dostępności boiska do kolorowania odznaki na mapie (zielony/pomarańczowy/czerwony/szary).
 * Wydzielone z fields.ts (zero zależności, w tym od supabase.ts), żeby dało się
 * to zaimportować z modułów, które muszą działać bez skonfigurowanego środowiska
 * Supabase — np. w testach jednostkowych czystej logiki.
 */
export type CourtAvailability = 'empty' | 'open' | 'filling' | 'full';

export function courtAvailability(
  playersCurrent: number,
  playersMax: number | null | undefined,
): CourtAvailability {
  if (playersCurrent <= 0 && playersMax == null) return 'empty';
  if (playersMax == null) return 'open';
  if (playersCurrent >= playersMax) return 'full';
  const remaining = playersMax - playersCurrent;
  const fillRatio = playersCurrent / playersMax;
  // "Szybko się zapełnia": zostało 1 miejsce albo obłożenie ≥75%.
  if (remaining <= 1 || fillRatio >= 0.75) return 'filling';
  return 'open';
}
