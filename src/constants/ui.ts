import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { Brand, BrandFonts, Layout, Radius } from '@/constants/theme';

type ShadowLevel = 'sm' | 'md' | 'lg' | 'float' | 'up';

const SHADOW_COLOR = '#0f172a';

export function shadow(level: ShadowLevel): ViewStyle {
  if (level === 'sm') {
    return Platform.select({
      ios: {
        shadowColor: SHADOW_COLOR,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }) as ViewStyle;
  }
  if (level === 'md') {
    return Platform.select({
      ios: {
        shadowColor: SHADOW_COLOR,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: {},
    }) as ViewStyle;
  }
  if (level === 'lg') {
    return Platform.select({
      ios: {
        shadowColor: SHADOW_COLOR,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
      default: {},
    }) as ViewStyle;
  }
  if (level === 'up') {
    // Cień "w górę" — dla paneli/pasków zadokowanych na dole ekranu (bottom
    // sheet, dolny pasek nawigacji), które mają wyglądać na unoszące się NAD
    // treścią pod nimi, a nie odwrotnie.
    return Platform.select({
      ios: {
        shadowColor: SHADOW_COLOR,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      default: {},
    }) as ViewStyle;
  }
  return Platform.select({
    ios: {
      shadowColor: SHADOW_COLOR,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    android: { elevation: 6 },
    default: {},
  }) as ViewStyle;
}

export const Typography = StyleSheet.create({
  /** Big Shoulders Display — WYŁĄCZNIE duże nagłówki ekranów, wyniki, wielkie
   * liczby statystyk. Nie używać do sectionTitle/cardTitle — kroju używamy
   * z umiarem, patrz plan redesignu. */
  display: {
    fontFamily: BrandFonts.display,
    fontSize: 34,
    letterSpacing: -0.2,
    color: Brand.textPrimary,
  },
  screenTitle: {
    fontFamily: BrandFonts.display,
    fontSize: 30,
    letterSpacing: -0.1,
    color: Brand.textPrimary,
  },
  sectionTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 17,
    letterSpacing: -0.1,
    color: Brand.textPrimary,
  },
  cardTitle: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 16,
    color: Brand.textPrimary,
  },
  body: {
    fontFamily: BrandFonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textPrimary,
  },
  bodySecondary: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textSecondary,
  },
  caption: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
  },
  label: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    letterSpacing: 0.2,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  link: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 15,
    color: Brand.primary,
  },
  /** IBM Plex Mono — liczby, które mają się czytać jak tablica wyników:
   * wyniki meczów, XP, liczniki graczy, zegary. `tabularNums` trzyma
   * kolumny cyfr wyrównane. */
  numeric: {
    fontFamily: BrandFonts.monoMedium,
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    color: Brand.textPrimary,
  },
  numericLarge: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 28,
    color: Brand.textPrimary,
  },
});

export const UI = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  screenPadded: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    paddingHorizontal: Layout.screenPaddingX,
  },
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: Layout.screenPaddingX,
    ...shadow('sm'),
  },
  cardFlat: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: Layout.screenPaddingX,
  },
  elevatedPill: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('float'),
  },
  pressed: {
    opacity: 0.88,
  },
  hairlineBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
});

export function fabStyle(): ViewStyle {
  return {
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('float'),
  };
}

export const pressedOpacity: TextStyle = { opacity: 0.88 };
