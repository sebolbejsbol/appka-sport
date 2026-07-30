const WEEKDAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const MONTHS = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Czytelna data + godzina meczu, np. „śr., 17 cze, 18:00”. */
export function formatEventDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sama godzina, np. „18:00”. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Krótki czas względny jak w Instagramie: „21 min”, „1 godz.”, „wczoraj”. */
export function formatRelativeShortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const diffMs = Math.max(0, now.getTime() - d.getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'teraz';
  if (diffMin < 60) return `${diffMin} min`;
  if (diffHours < 24) return `${diffHours} godz.`;
  if (diffDays === 1) return 'wczoraj';
  if (diffDays < 7) return `${diffDays} d.`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Domyślny start nowego meczu: najbliższa pełna godzina + 1h. */
export function defaultEventStart(now = new Date()): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Łączy pola „data” (YYYY-MM-DD) i „godzina” (HH:MM) w lokalny czas → ISO.
 * Zwraca null, jeśli format jest nieprawidłowy.
 */
export function parseLocalDateTime(dateStr: string, timeStr: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const [, y, m, day] = dateMatch;
  const [, h, min] = timeMatch;
  const year = Number(y);
  const month = Number(m);
  const dayNum = Number(day);
  const hour = Number(h);
  const minute = Number(min);

  if (month < 1 || month > 12 || dayNum < 1 || dayNum > 31) return null;
  if (hour > 23 || minute > 59) return null;

  const d = new Date(year, month - 1, dayNum, hour, minute, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
