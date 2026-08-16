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
 * Zgłoszenie 2026-08-17 (druga runda): poprzednia wersja robiła `scaleX(-1)`
 * na CAŁEJ sylwetce (jeden pełny glif Material Symbols) — to mirror'owało
 * też głowę/tułów, więc wyglądało jak odwracanie się o 180°, nie bieg.
 * Rozwiązanie: głowa i tułów są TERAZ osobnymi, statycznymi elementami
 * (nigdy się nie ruszają/nie odbijają — biegacz zawsze zwrócony w tę samą
 * stronę), a rusza się TYLKO para noga+ręka — dyskretny (steps, bez
 * płynnego przejścia) skok między dwiema pozycjami wymachu, jak realny
 * cykl biegu. Zero ruchu w pionie, zero rotacji/mirror'owania całości.
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

  const frameAProps = useAnimatedProps(() => ({
    opacity: flip.value === 1 ? 1 : 0,
  }));
  const frameBProps = useAnimatedProps(() => ({
    opacity: flip.value === 1 ? 0 : 1,
  }));

  const limbProps = { stroke: Brand.primary, strokeWidth: 6, strokeLinecap: 'round' as const, fill: 'none' as const };

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={31} cy={9} r={5} fill={Brand.primary} />
        <Path d="M28 13 L21 27" {...limbProps} />
        <AnimatedG animatedProps={frameAProps}>
          <Path d="M21 27 L29 33 L35 40" {...limbProps} strokeLinejoin="round" />
          <Path d="M21 27 L10 35" {...limbProps} />
          <Path d="M28 13 L18 20" {...limbProps} />
          <Path d="M28 13 L38 8" {...limbProps} />
        </AnimatedG>
        <AnimatedG animatedProps={frameBProps}>
          <Path d="M21 27 L25 32 L27 39" {...limbProps} strokeLinejoin="round" />
          <Path d="M21 27 L15 31" {...limbProps} />
          <Path d="M28 13 L22 17" {...limbProps} />
          <Path d="M28 13 L33 10" {...limbProps} />
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
