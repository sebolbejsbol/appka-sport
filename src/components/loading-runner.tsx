import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Brand } from '@/constants/theme';

/**
 * Animacja ładowania — biegnąca postać zamiast ActivityIndicator (patrz
 * splash w src/app/_layout.tsx). Celowo bez Lottie/nowych zależności ani
 * plików graficznych: pojedynczy emoji + Reanimated (już używany w całej
 * apce) daje płynną, zapętloną animację praktycznie bez kosztu — nie może
 * spowalniać ładowania, które sama ilustruje.
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    );
  }, [t]);

  const runnerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -t.value * (size * 0.28) },
      { rotate: `${-8 + t.value * 16}deg` },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.22 - t.value * 0.1,
    transform: [{ scaleX: 1 - t.value * 0.35 }],
  }));

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.Text style={[styles.runner, { fontSize: size }, runnerStyle]}>🏃</Animated.Text>
      <Animated.View style={[styles.shadow, { width: size * 0.7 }, shadowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  runner: {
    lineHeight: undefined,
  },
  shadow: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Brand.textPrimary,
    marginTop: 6,
  },
});
