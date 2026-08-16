import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';

const AnimatedG = Animated.createAnimatedComponent(G);

/**
 * Animacja ładowania — biegnąca postać zamiast ActivityIndicator (patrz
 * splash w src/app/_layout.tsx, i statyczny odpowiednik czysto w CSS w
 * public/index.html, pokazywany zanim JS w ogóle się doładuje — MUSI
 * wyglądać identycznie, żeby przejście między nimi było niewidoczne).
 *
 * Zgłoszenie 2026-08-17 (trzecia runda): "lepiej ale musi wyglądać jakby
 * biegł" — poprzednia para klatek (nogi/ręce lekko "pompujące" w tym samym
 * miejscu) była za mało kontrastowa, czytała się jak marsz w miejscu, nie
 * bieg. Zamienione na klasyczną parę kluczowych pozycji biegu z ikonografii
 * sportowej: klatka A = "wykrok" (obie nogi maksymalnie rozstawione,
 * przód-tył, jak w fazie kontaktu ze stopą), klatka B = "przenoszenie" (noga
 * z przodu z kolanem uniesionym WYSOKO, noga z tyłu podkurzona do tyłu jak
 * przy odbiciu) — to uniesienie kolana to ruch STAWU w obrębie stałego
 * tułowia, nie podskok całej sylwetki, więc nie łamie zasady "zero ruchu w
 * pionie całej postaci". Głowa i tułów (z lekkim, stałym pochyleniem do
 * przodu) są statyczne i nigdy się nie odbijają — biegacz zawsze zwrócony w
 * tę samą stronę, dyskretny (bez płynnego przejścia) skok między klatkami.
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const flip = useSharedValue(1);

  useEffect(() => {
    flip.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(1, { duration: 200 }),
        withTiming(-1, { duration: 0 }),
        withTiming(-1, { duration: 200 }),
      ),
      -1,
    );
  }, [flip]);

  const frameAProps = useAnimatedProps(() => ({
    opacity: flip.value === 1 ? 1 : 0,
  }));
  const frameBProps = useAnimatedProps(() => ({
    opacity: flip.value === 1 ? 0 : 1,
  }));

  const limbProps = { stroke: Brand.primary, strokeWidth: 7, strokeLinecap: 'round' as const, fill: 'none' as const };

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={30} cy={8} r={5.5} fill={Brand.primary} />
        <Path d="M27 12 L19 26" {...limbProps} />
        <AnimatedG animatedProps={frameAProps}>
          <Path d="M19 26 L28 31 L36 39" {...limbProps} strokeLinejoin="round" />
          <Path d="M19 26 L6 33" {...limbProps} />
          <Path d="M27 12 L15 17" {...limbProps} />
          <Path d="M27 12 L39 7" {...limbProps} />
        </AnimatedG>
        <AnimatedG animatedProps={frameBProps}>
          <Path d="M19 26 L24 18 L30 22" {...limbProps} strokeLinejoin="round" />
          <Path d="M19 26 L12 20" {...limbProps} />
          <Path d="M27 12 L20 6" {...limbProps} />
          <Path d="M27 12 L33 20" {...limbProps} />
        </AnimatedG>
      </Svg>
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
