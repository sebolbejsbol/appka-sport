export type CountryOption = {
  code: string;
  name: string;
};

/** Kraje dostępne w profilu (ISO 3166-1 alpha-2). */
export const PROFILE_COUNTRIES: CountryOption[] = [
  { code: 'PL', name: 'Polska' },
  { code: 'DE', name: 'Niemcy' },
  { code: 'GB', name: 'Wielka Brytania' },
  { code: 'US', name: 'Stany Zjednoczone' },
  { code: 'UA', name: 'Ukraina' },
  { code: 'LT', name: 'Litwa' },
  { code: 'CZ', name: 'Czechy' },
  { code: 'SK', name: 'Słowacja' },
  { code: 'FR', name: 'Francja' },
  { code: 'ES', name: 'Hiszpania' },
  { code: 'IT', name: 'Włochy' },
  { code: 'NL', name: 'Holandia' },
  { code: 'SE', name: 'Szwecja' },
  { code: 'NO', name: 'Norwegia' },
  { code: 'DK', name: 'Dania' },
  { code: 'IE', name: 'Irlandia' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Szwajcaria' },
  { code: 'BE', name: 'Belgia' },
  { code: 'PT', name: 'Portugalia' },
];

export function countryCodeToFlag(code: string | null | undefined): string {
  if (!code || code.length !== 2) return '';
  const upper = code.toUpperCase();
  return [...upper].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join('');
}

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return PROFILE_COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}
