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
 * Zgłoszenie 2026-08-16: poprzednia wersja (pojedynczy emoji 🏃, 3-punktowa
 * animacja translateY+rotate) wyglądała "nieładnie"/kanciasto i zależała od
 * czcionki emoji systemu (inny wygląd na Windows/macOS/Android). Zamiast
 * tego: ten sam glif Material Symbols ("directions_run"), którego już
 * używa ikona biegacza na mapie (patrz scripts/generate-bubble-icons.mjs),
 * w kolorze marki — spójny, ostry w każdej rozdzielczości SVG. `t` biegnie
 * LINIOWO 0→1 w kółko, a pozycję/rotację/przechył liczymy jako funkcje
 * trygonometryczne t wewnątrz useAnimatedStyle — daje to płynny, ciągły
 * ruch bez "szwów" między klatkami kluczowymi (w przeciwieństwie do
 * poprzedniej sekwencji 2 x withTiming, która czuła się jak odbijanie
 * piłki, nie bieg).
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
  }, [t]);

  const runnerStyle = useAnimatedStyle(() => {
    const bounce = Math.abs(Math.sin(t.value * Math.PI));
    const stride = Math.sin(t.value * Math.PI * 2);
    return {
      transform: [
        { translateY: -bounce * size * 0.26 },
        { translateX: stride * size * 0.05 },
        { rotate: `${stride * 10}deg` },
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

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Animated.View style={runnerStyle}>
        <Svg width={size} height={size} viewBox="0 -960 960 960">
          <Path
            fill={Brand.primary}
            d="M535-70v-209l-108-99-36 159q-3 12-13 18.5t-22 4.5l-208-43q-11-2-18-12t-5-22q2-12 12.5-18t21.5-4l171 34 73-369-100 47v104q0 13-8.5 21.5T273-449q-13 0-21.5-8.5T243-479v-125q0-9 5-16.5t13-11.5l146-61q32-14 45.5-17.5T480-714q20 0 35.5 8.5T542-680l42 67q23 37 60 65.5t86 36.5q13 2 21.5 10.5T760-479q0 12-8.5 21t-20.5 7q-57-6-102.5-36.5T543-573l-39 158 81 75q5 5 7.5 10.5T595-318v248q0 13-8.5 21.5T565-40q-13 0-21.5-8.5T535-70Zm-46.5-705.5Q467-797 467-827t21.5-51.5Q510-900 540-900t51.5 21.5Q613-857 613-827t-21.5 51.5Q570-754 540-754t-51.5-21.5Z"
          />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.shadow, { width: size * 0.7 }, shadowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  shadow: {
    height: 8,
    borderRadius: 999,
    backgroundColor: Brand.textPrimary,
    marginTop: 6,
  },
});
