import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

const DOT_SIZE = 10;
const BOUNCE_HEIGHT = 10;
const PERIOD = 900;
const STAGGER = 150;

/**
 * Ładowanie pod logiem — trzy podskakujące kropki (patrz splash w
 * src/app/_layout.tsx, i statyczny odpowiednik w public/index.html,
 * pokazywany zanim JS w ogóle się doładuje — MUSI wyglądać identycznie,
 * żeby przejście między nimi było niewidoczne).
 */
function Dot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-BOUNCE_HEIGHT, { duration: PERIOD * 0.4, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: PERIOD * 0.4, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: PERIOD * 0.2 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, translateY]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return <Animated.View style={[styles.dot, style]} />;
}

export function LoadingDots() {
  return (
    <View style={styles.row}>
      <Dot delay={0} />
      <Dot delay={STAGGER} />
      <Dot delay={STAGGER * 2} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BOUNCE_HEIGHT + DOT_SIZE,
    gap: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Brand.primary,
  },
});
