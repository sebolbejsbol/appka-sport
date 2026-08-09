import { getLocale } from '@/i18n';

function isEnglish(): boolean {
  return getLocale() === 'en';
}

/** Polska odmiana po liczbie: 1 / 2–4 / 5+ (z wyjątkiem 12–14). */
export function polishPlural(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(Math.trunc(count));
  if (n === 1) return one;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function isFew(count: number): boolean {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
}

/** Prosta odmiana angielska: liczba pojedyncza / mnoga (+s). */
function englishPlural(count: number, singular: string, plural: string): string {
  return Math.abs(Math.trunc(count)) === 1 ? singular : plural;
}

export function pluralBoisko(count: number): string {
  if (isEnglish()) return englishPlural(count, 'court', 'courts');
  return polishPlural(count, 'boisko', 'boiska', 'boisk');
}

export function pluralEvent(count: number): string {
  if (isEnglish()) return englishPlural(count, 'event', 'events');
  return polishPlural(count, 'event', 'eventy', 'eventów');
}

export function pluralGracz(count: number): string {
  if (isEnglish()) return englishPlural(count, 'player', 'players');
  return polishPlural(count, 'gracz', 'gracze', 'graczy');
}

export function formatCountBoisko(count: number): string {
  return `${count} ${pluralBoisko(count)}`;
}

export function formatCountEvent(count: number): string {
  return `${count} ${pluralEvent(count)}`;
}

/** „3 boiska · 5 eventów” */
export function formatMapLiveCount(fields: number, events: number): string {
  return `${formatCountBoisko(fields)} · ${formatCountEvent(events)}`;
}

/** „1 event pasuje do filtrów” / „3 eventy pasują…” / „5 eventów pasuje…” */
export function formatFilterResults(count: number): string {
  if (isEnglish()) {
    const verb = Math.abs(Math.trunc(count)) === 1 ? 'matches' : 'match';
    return `${count} ${pluralEvent(count)} ${verb} the filters`;
  }
  const verb = isFew(count) ? 'pasują' : 'pasuje';
  return `${count} ${pluralEvent(count)} ${verb} do filtrów`;
}

/** „Na mapie widać 1 pasujące boisko” */
export function formatMapMatchingFields(count: number): string {
  if (isEnglish()) {
    return `${count} matching ${pluralBoisko(count)} on the map`;
  }
  if (count === 1) return 'Na mapie widać 1 pasujące boisko';
  if (isFew(count)) return `Na mapie widać ${count} pasujące boiska`;
  return `Na mapie widać ${count} pasujących boisk`;
}

/** „1 wolne miejsce” / „3 wolne miejsca” / „5 wolnych miejsc” */
export function formatSpotsFree(count: number): string {
  if (isEnglish()) {
    return `${count} free ${englishPlural(count, 'spot', 'spots')}`;
  }
  const phrase = polishPlural(count, 'wolne miejsce', 'wolne miejsca', 'wolnych miejsc');
  return `${count} ${phrase}`;
}

/** „3/10 graczy” lub „1 gracz” */
export function formatPlayersCount(current: number, max?: number | null): string {
  if (isEnglish()) {
    if (max != null) return `${current}/${max} players`;
    return `${current} ${pluralGracz(current)}`;
  }
  if (max != null) return `${current}/${max} graczy`;
  return `${current} ${pluralGracz(current)}`;
}

/** „1 ocena” / „3 oceny” / „5 ocen” */
export function formatRatingCount(count: number): string {
  if (isEnglish()) {
    return `${count} ${englishPlural(count, 'rating', 'ratings')}`;
  }
  const phrase = polishPlural(count, 'ocena', 'oceny', 'ocen');
  return `${count} ${phrase}`;
}

/** „2 eventy na 3 boiskach” / „1 event na 1 boisku” */
export function formatMapSearchResults(events: number, fields: number): string {
  if (isEnglish()) {
    return `${formatCountEvent(events)} at ${fields} ${pluralBoisko(fields)}`;
  }
  const fieldPart = fields === 1 ? `na ${fields} boisku` : `na ${fields} boiskach`;
  return `${formatCountEvent(events)} ${fieldPart}`;
}

/** „Rozegraliście razem 3 eventy” */
export function formatPlayedTogether(count: number): string {
  const n = Math.abs(Math.trunc(count));
  if (isEnglish()) {
    return `You've played ${n} ${pluralEvent(n)} together`;
  }
  if (n === 1) return 'Rozegraliście razem 1 event';
  if (isFew(n)) return `Rozegraliście razem ${n} eventy`;
  return `Rozegraliście razem ${n} eventów`;
}
