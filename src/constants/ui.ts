import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { Brand, Layout, Radius } from '@/constants/theme';

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
  display: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: Brand.textPrimary,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: Brand.textPrimary,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
    color: Brand.textPrimary,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textPrimary,
  },
  bodySecondary: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textSecondary,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    color: Brand.textMuted,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.primary,
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
