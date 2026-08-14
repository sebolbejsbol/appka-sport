import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';

/**
 * Lekki loading state na start mapy — pokazywany TYLKO gdy nie ma jeszcze
 * żadnych boisk do narysowania (pierwsze, zimne otwarcie apki bez cache'u
 * i wolna sieć). Zastępuje pusty ekran/długi spinner jedną, spokojnie
 * pulsującą kropką + podpisem, w stylu wizualnym reszty apki (pill, shadow).
 * Gdy jest już cokolwiek do pokazania (z cache'u lub sieci), znika.
 */
export function FieldsLoadingHint() {
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <Animated.View style={[styles.dot, dotStyle]} />
        <Text style={styles.label}>{t('map.loadingFields')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '42%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 15,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('md'),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
});
