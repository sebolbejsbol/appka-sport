import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Brand, BrandFonts } from '@/constants/theme';
import type { LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import {
  showNavigationError,
  startFieldNavigation,
  type FieldDestination,
} from '@/lib/field-navigation';

type Props = {
  destination: FieldDestination;
  userCoords?: LngLat | null;
  onBeforeNavigate?: () => void;
  variant?: 'primary' | 'outline';
  style?: StyleProp<ViewStyle>;
};

export function NavigateToFieldButton({
  destination,
  userCoords,
  onBeforeNavigate,
  variant = 'outline',
  style,
}: Props) {
  const [busy, setBusy] = useState(false);
  const isPrimary = variant === 'primary';

  async function handlePress() {
    setBusy(true);
    const result = await startFieldNavigation(destination, {
      userCoords,
      closeBeforeNavigate: onBeforeNavigate,
    });
    setBusy(false);

    if (result !== 'google_maps' && result !== 'in_app') {
      showNavigationError(result);
    }
  }

  return (
    <Pressable
      onPress={() => void handlePress()}
      disabled={busy}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.outline,
        pressed && styles.pressed,
        busy && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={isPrimary ? Brand.primaryText : Brand.primary} size="small" />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.primaryLabel : styles.outlineLabel]}>
          {t('fieldNavigation.navigate')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  primary: {
    backgroundColor: Brand.primary,
  },
  outline: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  label: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryLabel: {
    color: Brand.primaryText,
  },
  outlineLabel: {
    color: Brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.7,
  },
});
