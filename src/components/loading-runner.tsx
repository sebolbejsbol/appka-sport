import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';

/**
 * Animacja ładowania — biegnąca postać zamiast ActivityIndicator (patrz
 * splash w src/app/_layout.tsx, i statyczny odpowiednik czysto w CSS w
 * public/index.html, pokazywany zanim JS w ogóle się doładuje — MUSI
 * wyglądać identycznie, żeby przejście między nimi było niewidoczne).
 *
 * Zgłoszenie 2026-08-17: "nie ma się kręcić! ma biec w jedno miejsce i mieć
 * 2 animacje biegu jak zmienia ręce i nogi" — ŻADNEGO ruchu w pionie ANI
 * obrotu (poprzedni `rotate` + płynne przejście `scaleX` przez zero
 * wyglądały jak kręcenie się/spin). Biegacz stoi w jednym miejscu; jedyna
 * zmiana to DYSKRETNA (natychmiastowa, bez płynnego przejścia przez środek)
 * zamiana pomiędzy dwiema pozycjami — zwykłą i lustrzanym odbiciem tej
 * samej asymetrycznej sylwetki Material Symbols "directions_run" — czyli
 * dokładnie "2 animacje jak zmienia ręce i nogi": klatka A (ręka/noga w
 * przód po jednej stronie) i klatka B (po drugiej), przełączane skokowo w
 * rytm kroku, nie płynnie interpolowane. Cień pod stopami statyczny.
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const flip = useSharedValue(1);

  useEffect(() => {
    flip.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1, { duration: 220 }),
        withTiming(-1, { duration: 0 }),
        withTiming(-1, { duration: 220 }),
      ),
      -1,
    );
  }, [flip]);

  const runnerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: flip.value }],
  }));

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
      <View style={[styles.shadow, { width: size * 0.7 }]} />
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
    opacity: 0.18,
    marginTop: 6,
  },
});
