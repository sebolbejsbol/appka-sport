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
 * Zgłoszenie 2026-08-17 (czwarta runda): "ten ziomek nie biegnie" — na
 * żywo wyrenderowane (sprawdzone przez sharp/rsvg z node, nie na oko —
 * poprzednia grubość strokeWidth=7 przy tak krótkich odcinkach kończyn w
 * viewBox 48 zlewała się w jedną bezkształtną plamę, w ogóle nie dało się
 * rozróżnić rąk/nóg/tułowia). Przeprojektowane na proporcje patyczaka:
 * dłuższe kończyny, cieńszy stroke (4), większy rozstaw stawów, żeby
 * sylwetka faktycznie czytała się jako biegnący człowiek. Klatka A =
 * szeroki wykrok (obie stopy przy ziemi, przód-tył), klatka B = kolano
 * uniesione, ale noga podporowa NADAL sięga do tej samej linii "gruntu" co
 * w klatce A (żeby całość nie "podskakiwała" wizualnie między klatkami —
 * to był błąd wcześniejszej wersji, gdzie OBIE nogi odrywały się od ziemi
 * naraz). Głowa+tułów statyczne, nigdy się nie odbijają — biegacz zawsze
 * zwrócony w tę samą stronę, dyskretny (bez płynnego przejścia) skok
 * między klatkami.
 *
 * Zgłoszenie 2026-08-17 (piąta runda): "dalej bardzo słabo biegnie, ma
 * używać nóg i rąk przy biegu jak normalna osoba" — po ponownym
 * wyrenderowaniu okazało się, że współrzędne dłoni w klatce A i B były
 * PRAWIE IDENTYCZNE (różnica 1-2px), czyli ręce w ogóle się wizualnie nie
 * ruszały — biegacz "biegł" wyłącznie nogami, ręce stały w miejscu jak
 * przyklejone. Ręce dostały teraz taki sam duży zakres wymachu jak nogi
 * (przód/tył na wysokości klatki piersiowej, nie nad głową — tam wyglądało
 * jak jedna ciągła linia z szyją), naprzemiennie z nogami między klatkami.
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

  const limbProps = { stroke: Brand.primary, strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' as const };

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={6} r={4} fill={Brand.primary} />
        <Path d="M23 12 L17 25" {...limbProps} />
        <AnimatedG animatedProps={frameAProps}>
          <Path d="M17 25 L26 32 L34 42" {...limbProps} strokeLinejoin="round" />
          <Path d="M17 25 L4 40" {...limbProps} />
          <Path d="M23 12 L35 15" {...limbProps} />
          <Path d="M23 12 L6 19" {...limbProps} />
        </AnimatedG>
        <AnimatedG animatedProps={frameBProps}>
          <Path d="M17 25 L24 20 L29 24" {...limbProps} strokeLinejoin="round" />
          <Path d="M17 25 L19 43" {...limbProps} />
          <Path d="M23 12 L8 16" {...limbProps} />
          <Path d="M23 12 L34 18" {...limbProps} />
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
