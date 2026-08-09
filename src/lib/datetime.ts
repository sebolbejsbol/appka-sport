import { getLocale, t } from '@/i18n';

const WEEKDAYS_PL = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_PL = [
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
const MONTHS_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function weekdays(): string[] {
  return getLocale() === 'en' ? WEEKDAYS_EN : WEEKDAYS_PL;
}

function months(): string[] {
  return getLocale() === 'en' ? MONTHS_EN : MONTHS_PL;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Czytelna data + godzina meczu, np. „śr., 17 cze, 18:00”. */
export function formatEventDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${weekdays()[d.getDay()]}, ${d.getDate()} ${months()[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  if (diffMin < 1) return t('common.timeNow');
  if (diffMin < 60) return `${diffMin} min`;
  if (diffHours < 24) return `${diffHours} ${t('common.timeHoursShort')}`;
  if (diffDays === 1) return t('common.timeYesterday');
  if (diffDays < 7) return `${diffDays} ${t('common.timeDaysShort')}`;
  return `${d.getDate()} ${months()[d.getMonth()]}`;
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
