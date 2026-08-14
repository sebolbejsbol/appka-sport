import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Brand, Radius } from '@/constants/theme';

/**
 * Pierwszy w apce prymityw do "szkieletowego" ładowania — pulsujący
 * placeholder w miejscu treści, która jeszcze nie doszła z sieci. Zamiast
 * pustego ekranu / gołego spinnera daje wrażenie, że układ jest już gotowy
 * i za chwilę "ożyje" prawdziwymi danymi.
 */
export function SkeletonBlock({
  width = '100%',
  height = 14,
  radius = Radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: Brand.surfaceMuted },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Wiersz-placeholder w kształcie karty boiska: kropka statusu + emoji + dwie linie tekstu. */
export function FieldRowSkeleton() {
  return (
    <View style={styles.row}>
      <SkeletonBlock width={9} height={9} radius={5} />
      <SkeletonBlock width={30} height={30} radius={15} />
      <View style={styles.rowMain}>
        <SkeletonBlock width="62%" height={13} radius={4} />
        <SkeletonBlock width="40%" height={11} radius={4} style={styles.rowMetaGap} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  rowMain: {
    flex: 1,
    gap: 6,
  },
  rowMetaGap: {
    marginTop: 0,
  },
});
