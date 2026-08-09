import { getLocale } from '@/i18n';

export type CountryOption = {
  code: string;
  name: string;
};

const NAMES_PL: Record<string, string> = {
  PL: 'Polska',
  DE: 'Niemcy',
  GB: 'Wielka Brytania',
  US: 'Stany Zjednoczone',
  UA: 'Ukraina',
  LT: 'Litwa',
  CZ: 'Czechy',
  SK: 'Słowacja',
  FR: 'Francja',
  ES: 'Hiszpania',
  IT: 'Włochy',
  NL: 'Holandia',
  SE: 'Szwecja',
  NO: 'Norwegia',
  DK: 'Dania',
  IE: 'Irlandia',
  AT: 'Austria',
  CH: 'Szwajcaria',
  BE: 'Belgia',
  PT: 'Portugalia',
};

const NAMES_EN: Record<string, string> = {
  PL: 'Poland',
  DE: 'Germany',
  GB: 'United Kingdom',
  US: 'United States',
  UA: 'Ukraine',
  LT: 'Lithuania',
  CZ: 'Czechia',
  SK: 'Slovakia',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  IE: 'Ireland',
  AT: 'Austria',
  CH: 'Switzerland',
  BE: 'Belgium',
  PT: 'Portugal',
};

/** Kraje dostępne w profilu (ISO 3166-1 alpha-2), w kolejności wyświetlania. */
export const PROFILE_COUNTRIES: CountryOption[] = Object.keys(NAMES_PL).map((code) => ({
  code,
  name: NAMES_PL[code],
}));

export function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return [...upper].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

/** Nazwa kraju w aktualnym języku aplikacji — wywoływać w renderze, nie raz przy imporcie. */
export function countryLabel(code: string | null | undefined): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  const table = getLocale() === 'en' ? NAMES_EN : NAMES_PL;
  return table[upper] ?? upper;
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return countryLabel(code) || code;
}
