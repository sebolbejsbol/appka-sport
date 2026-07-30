/**
 * Design tokens — DUDIE DAY
 * Paleta pod logo: elektryczny błękit + chłodne, „srebrne" neutralne tony
 * + prawie-czerń (jak tło logotypu). Nowoczesny, profesjonalny wygląd.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0a0e16',
    background: '#f2f5fb',
    backgroundElement: '#e7edf6',
    backgroundSelected: '#d8e2f3',
    textSecondary: '#46566c',
  },
  dark: {
    text: '#f5f8ff',
    background: '#0a0e16',
    backgroundElement: '#161c28',
    backgroundSelected: '#26304a',
    textSecondary: '#8a99af',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Brand = {
  primary: '#1f6bff',
  primaryDark: '#1450d4',
  primaryLight: '#e9f0ff',
  primaryMuted: '#9ec0ff',
  primaryText: '#ffffff',

  /** Akcent „srebro" z logotypu — do subtelnych detali. */
  silver: '#c3ccd9',
  ink: '#0a0e16',

  screenBackground: '#f2f5fb',
  surface: '#ffffff',
  surfaceMuted: '#eef2f9',

  border: '#e0e6f0',
  borderStrong: '#c6d0e0',
  divider: '#eaeff7',

  textPrimary: '#0a0e16',
  textSecondary: '#46566c',
  textMuted: '#8a99af',
  textInverse: '#ffffff',

  danger: '#dc2626',
  dangerLight: '#fef2f2',
  success: '#0ea371',
  successLight: '#e7faf2',
  warning: '#d97706',
  warningLight: '#fffbeb',
  info: '#1f6bff',
  infoLight: '#e9f0ff',

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
