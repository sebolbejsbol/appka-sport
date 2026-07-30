import { t } from '@/i18n';

const MIN_AGE = 16;
const MIN_PASSWORD_LENGTH = 8;
const MIN_NICK_LENGTH = 2;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Limity tekstu eventu — dłuższe dozwolone, na listach tylko skrót. */
export const MAX_EVENT_TITLE_WORDS = 12;
export const MAX_EVENT_NOTES_WORDS = 50;
export const MAX_EVENT_TITLE_CHARS = 80;
export const MAX_EVENT_NOTES_CHARS = 400;

export const MAX_FIELD_NAME_CHARS = 120;
export const MAX_FIELD_NOTE_CHARS = 400;

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function enforceEventTextLimit(
  value: string,
  opts: { maxWords: number; maxChars: number },
): string {
  const wordLimited = value.trimStart().split(/\s+/).slice(0, opts.maxWords).join(' ');
  return wordLimited.slice(0, opts.maxChars);
}

export function validateEventTitle(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_EVENT_TITLE_CHARS) {
    return t('event.errors.titleTooLong');
  }
  if (countWords(trimmed) > MAX_EVENT_TITLE_WORDS) {
    return t('event.errors.titleTooManyWords');
  }
  return undefined;
}

export function validateEventNotes(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_EVENT_NOTES_CHARS) {
    return t('event.errors.notesTooLong');
  }
  if (countWords(trimmed) > MAX_EVENT_NOTES_WORDS) {
    return t('event.errors.notesTooManyWords');
  }
  return undefined;
}

export function validateFieldName(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return t('fieldReport.errors.nameRequired');
  if (trimmed.length < 2) return t('fieldReport.errors.nameTooShort');
  if (trimmed.length > MAX_FIELD_NAME_CHARS) return t('fieldReport.errors.nameTooLong');
  return undefined;
}

export function validateFieldNote(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_FIELD_NOTE_CHARS) return t('fieldReport.errors.noteTooLong');
  return undefined;
}

export function validateNick(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return t('errors.nickRequired');
  if (trimmed.length < MIN_NICK_LENGTH) return t('errors.nickTooShort');
  if (trimmed.length > 24) return t('errors.nickTooLong');
  const reserved = ['admin', 'administrator', 'root', 'moderator'];
  if (reserved.includes(trimmed.toLowerCase())) return t('errors.nickReserved');
  return undefined;
}

/** Zwraca komunikat błędu albo undefined, gdy wartość jest poprawna. */
export function validateEmail(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return t('errors.emailRequired');
  if (!EMAIL_PATTERN.test(trimmed)) return t('errors.emailInvalid');
  return undefined;
}

export function validatePassword(value: string): string | undefined {
  if (!value) return t('errors.passwordRequired');
  if (value.length < MIN_PASSWORD_LENGTH) return t('errors.passwordTooShort');
  return undefined;
}

export function validateBirthYear(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return t('errors.birthYearRequired');

  const year = Number(trimmed);
  const currentYear = new Date().getFullYear();
  const isPlausibleYear = Number.isInteger(year) && year >= 1900 && year <= currentYear;
  if (!isPlausibleYear) return t('errors.birthYearInvalid');

  if (currentYear - year < MIN_AGE) return t('errors.tooYoung');
  return undefined;
}
