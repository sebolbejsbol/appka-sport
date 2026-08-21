/**
 * Design tokens — DUDIE DAY
 * Redesign 2026-08-21: paleta zakotwiczona w temacie apki (eventy sportowe
 * w Trójmieście) zamiast generycznego SaaS-blue — Harbor Blue (marka),
 * Regatta Teal (mapa/drugorzędne), Bursztyn Amber (bursztyn z Głównego
 * Miasta — odznaki/XP/rytuał zameldowania), Pitch Green (murawa boiska —
 * stan "otwarte"), Floodlight Ink (nagłówki/ciemne powierzchnie), Chalk
 * (tło — biel linii boiska). Patrz Fonts/Typography niżej dla par krojów.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0A0E16',
    background: '#F5F7FB',
    backgroundElement: '#EAEFF7',
    backgroundSelected: '#DCE6F5',
    textSecondary: '#46566c',
  },
  dark: {
    text: '#f5f8ff',
    background: '#0A0E16',
    backgroundElement: '#161c28',
    backgroundSelected: '#26304a',
    textSecondary: '#8a99af',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Brand = {
  primary: '#155EEF',
  primaryDark: '#0E3FB0',
  primaryLight: '#E7EEFE',
  primaryMuted: '#9EB8F9',
  primaryText: '#ffffff',

  /** Regatta Teal — mapa, akcje drugorzędne. */
  teal: '#0E7C86',
  tealLight: '#E4F1F2',
  /** Bursztyn Amber — bursztyn sprzedawany na Głównym Mieście w Gdańsku;
   * odznaki, XP, rytuał zameldowania (patrz check-in ripple). */
  amber: '#F2A33D',
  amberDark: '#B9761E',
  amberLight: '#FDF1E2',
  /** Pitch Green — murawa boiska; stan "otwarte"/sukces. */
  pitch: '#1FA463',
  pitchLight: '#E5F6ED',

  /** Zachowane dla starych odwołań — użyj `ink`. */
  silver: '#c3ccd9',
  ink: '#0A0E16',

  screenBackground: '#F5F7FB',
  surface: '#ffffff',
  surfaceMuted: '#EEF2F9',

  border: '#DCE3EF',
  borderStrong: '#C6D0E0',
  divider: '#EAEFF7',

  textPrimary: '#0A0E16',
  textSecondary: '#46566c',
  textMuted: '#66738A',
  textInverse: '#ffffff',

  danger: '#dc2626',
  dangerLight: '#fef2f2',
  success: '#1FA463',
  successLight: '#E5F6ED',
  warning: '#B9761E',
  warningLight: '#FDF1E2',
  info: '#155EEF',
  infoLight: '#E7EEFE',

  overlay: 'rgba(10, 14, 22, 0.5)',
  scrim: 'rgba(10, 14, 22, 0.66)',
} as const;

export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const Layout = {
  screenPaddingX: 20,
  screenPaddingBottom: 24,
  /** Odstęp pod przyciskiem menu (hamburger) */
  menuClearance: 56,
  maxContentWidth: 800,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * Marka apki: Big Shoulders Display (nagłówki/wyniki, z umiarem) + IBM Plex
 * Sans (treść/UI) + IBM Plex Mono (tabelki, liczniki, zegar). Wczytywane
 * przez useFonts w src/app/_layout.tsx — te same nazwy muszą tam być kluczami.
 * Fallback (przed wczytaniem fontu / gdyby się nie wczytał) to poprzedni
 * systemowy stos z Fonts.sans powyżej, więc RN nigdy nie zostaje bez fontu.
 */
export const BrandFonts = {
  display: Platform.select({ web: "'BigShouldersDisplay_800ExtraBold', var(--font-display)", default: 'BigShouldersDisplay_800ExtraBold' }),
  displaySemibold: Platform.select({ web: "'BigShouldersDisplay_700Bold', var(--font-display)", default: 'BigShouldersDisplay_700Bold' }),
  body: Platform.select({ web: "'IBMPlexSans_400Regular', var(--font-display)", default: 'IBMPlexSans_400Regular' }),
  bodyMedium: Platform.select({ web: "'IBMPlexSans_500Medium', var(--font-display)", default: 'IBMPlexSans_500Medium' }),
  bodySemibold: Platform.select({ web: "'IBMPlexSans_600SemiBold', var(--font-display)", default: 'IBMPlexSans_600SemiBold' }),
  bodyBold: Platform.select({ web: "'IBMPlexSans_700Bold', var(--font-display)", default: 'IBMPlexSans_700Bold' }),
  mono: Platform.select({ web: "'IBMPlexMono_400Regular', var(--font-mono)", default: 'IBMPlexMono_400Regular' }),
  monoMedium: Platform.select({ web: "'IBMPlexMono_500Medium', var(--font-mono)", default: 'IBMPlexMono_500Medium' }),
  monoSemibold: Platform.select({ web: "'IBMPlexMono_600SemiBold', var(--font-mono)", default: 'IBMPlexMono_600SemiBold' }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Layout.maxContentWidth;
