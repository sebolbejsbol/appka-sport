import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

type Props = {
  /** Odpala pulsowanie od momentu, gdy staje się true (patrz handleCheckIn w event/[id].tsx). */
  active: boolean;
  size?: number;
};

/**
 * Sygnaturowa animacja apki (patrz plan redesignu) — jedyne celowo
 * zaprojektowane pulsowanie w całej apce, zarezerwowane dla rytuału
 * zameldowania na boisku: bursztynowy pierścień "sonaru" rozchodzący się
 * z pinezki gracza. Wszystko inne w redesignie zostaje statyczne albo ma
 * krótkie, ciche przejścia — celowo, żeby nie wyglądać jak "AI-generated"
 * apka z animacją na każdym rogu.
 */
export function CheckInRipple({ active, size = 96 }: Props) {
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const ring3 = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(ring1);
      cancelAnimation(ring2);
      cancelAnimation(ring3);
      ring1.value = 0;
      ring2.value = 0;
      ring3.value = 0;
      return;
    }
    const pulse = () =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      );
    ring1.value = withDelay(0, pulse());
    ring2.value = withDelay(600, pulse());
    ring3.value = withDelay(1200, pulse());
  }, [active, ring1, ring2, ring3]);

  const style1 = useAnimatedStyle(() => ({
    opacity: (1 - ring1.value) * 0.6,
    transform: [{ scale: 0.25 + ring1.value }],
  }));
  const style2 = useAnimatedStyle(() => ({
    opacity: (1 - ring2.value) * 0.6,
    transform: [{ scale: 0.25 + ring2.value }],
  }));
  const style3 = useAnimatedStyle(() => ({
    opacity: (1 - ring3.value) * 0.6,
    transform: [{ scale: 0.25 + ring3.value }],
  }));

  if (!active) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style1]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style2]} />
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style3]} />
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Brand.amber,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Brand.amber,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
