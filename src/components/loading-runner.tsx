import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';

/**
 * Animacja ładowania — biegnąca postać zamiast ActivityIndicator (patrz
 * splash w src/app/_layout.tsx, i statyczny odpowiednik czysto w CSS w
 * public/index.html, pokazywany zanim JS w ogóle się doładuje — MUSI
 * wyglądać identycznie, żeby przejście między nimi było niewidoczne).
 *
 * Zgłoszenie 2026-08-16 (kilka rund): (1) emoji 🏃 -> wektorowy glif
 * Material Symbols "directions_run" w kolorze marki, (2) prosty odbijający
 * się 2-punktowy bounce -> ciągły ruch liczony trygonometrycznie z t, (3)
 * "ludzik musi być ciekawszy" -> ten plik: doszło przełączanie lustrzane
 * (scaleX) dokładnie w momentach zerowego przechyłu/wychylenia (t=0.25 i
 * t=0.75, gdy sylwetka i tak jest wyprostowana na środku) — ta konkretna
 * ikona ma asymetryczną pozę (jedna ręka/noga w przód), więc odbicie w
 * poziomie w neutralnym momencie daje tanią, ale realnie działającą
 * iluzję NA PRZEMIAN pracujących nóg zamiast jednej wciąż tej samej pozy,
 * plus 3 smugi prędkości za sylwetką w rytm kroku dla wrażenia szybkości,
 * plus szybszy, bardziej energiczny rytm (720ms zamiast 900ms).
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 720, easing: Easing.linear }), -1, false);
  }, [t]);

  const runnerStyle = useAnimatedStyle(() => {
    const bounce = Math.abs(Math.sin(t.value * Math.PI));
    const stride = Math.sin(t.value * Math.PI * 2);
    return {
      transform: [
        { translateY: -bounce * size * 0.3 },
        { translateX: stride * size * 0.05 },
        { rotate: `${stride * 10}deg` },
        { scaleX: stride >= 0 ? 1 : -1 },
      ],
    };
  });

  const shadowStyle = useAnimatedStyle(() => {
    const bounce = Math.abs(Math.sin(t.value * Math.PI));
    return {
      opacity: 0.24 - bounce * 0.12,
      transform: [{ scaleX: 1 - bounce * 0.38 }],
    };
  });

  const speedLinesStyle = useAnimatedStyle(() => {
    const bounce = Math.abs(Math.sin(t.value * Math.PI));
    return {
      opacity: 0.15 + bounce * 0.35,
      transform: [{ translateX: -bounce * size * 0.16 }],
    };
  });

  return (
    <View style={[styles.root, { width: size * 1.9, height: size * 1.6 }]}>
      <View style={styles.stage}>
        <Animated.View style={[styles.speedLines, { right: size * 0.98 }, speedLinesStyle]}>
          <View style={[styles.speedLine, { width: size * 0.4 }]} />
          <View style={[styles.speedLine, { width: size * 0.28, marginTop: size * 0.1 }]} />
          <View style={[styles.speedLine, { width: size * 0.34, marginTop: size * 0.1 }]} />
        </Animated.View>
        <Animated.View style={runnerStyle}>
          <Svg width={size} height={size} viewBox="0 -960 960 960">
            <Path
              fill={Brand.primary}
              d="M535-70v-209l-108-99-36 159q-3 12-13 18.5t-22 4.5l-208-43q-11-2-18-12t-5-22q2-12 12.5-18t21.5-4l171 34 73-369-100 47v104q0 13-8.5 21.5T273-449q-13 0-21.5-8.5T243-479v-125q0-9 5-16.5t13-11.5l146-61q32-14 45.5-17.5T480-714q20 0 35.5 8.5T542-680l42 67q23 37 60 65.5t86 36.5q13 2 21.5 10.5T760-479q0 12-8.5 21t-20.5 7q-57-6-102.5-36.5T543-573l-39 158 81 75q5 5 7.5 10.5T595-318v248q0 13-8.5 21.5T565-40q-13 0-21.5-8.5T535-70Zm-46.5-705.5Q467-797 467-827t21.5-51.5Q510-900 540-900t51.5 21.5Q613-857 613-827t-21.5 51.5Q570-754 540-754t-51.5-21.5Z"
            />
          </Svg>
        </Animated.View>
      </View>
      <Animated.View style={[styles.shadow, { width: size * 0.7 }, shadowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  speedLines: {
    position: 'absolute',
    alignItems: 'flex-end',
  },
  speedLine: {
    height: 3,
    borderRadius: 999,
    backgroundColor: Brand.primaryMuted,
  },
  shadow: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Brand.textPrimary,
    marginTop: 6,
  },
});
