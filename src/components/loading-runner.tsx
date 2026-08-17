import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  SharedValue,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Point = [number, number];

function usePathProps(phase: SharedValue<number>, pointsA: Point[], pointsB: Point[]) {
  return useAnimatedProps(() => {
    const d = pointsA
      .map((p, i) => {
        const x = interpolate(phase.value, [0, 1], [p[0], pointsB[i][0]]);
        const y = interpolate(phase.value, [0, 1], [p[1], pointsB[i][1]]);
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      })
      .join(' ');
    return { d };
  });
}

function useCapProps(phase: SharedValue<number>, a: Point, b: Point) {
  return useAnimatedProps(() => ({
    cx: interpolate(phase.value, [0, 1], [a[0], b[0]]),
    cy: interpolate(phase.value, [0, 1], [a[1], b[1]]),
  }));
}

/**
 * Animacja ładowania — biegnąca postać zamiast ActivityIndicator (patrz
 * splash w src/app/_layout.tsx, i statyczny odpowiednik czysto w CSS w
 * public/index.html, pokazywany zanim JS w ogóle się doładuje — MUSI
 * wyglądać identycznie, żeby przejście między nimi było niewidoczne).
 *
 * Historia (2026-08-17, ten sam dzień, ~6 rund poprawek — pełne detale w
 * pamięci projektu / historii gita commitów loading-runner.tsx): mirror
 * całej sylwetki wyglądał jak odwracanie się -> zamieniony na statyczną
 * głowę/tułów + ruchome kończyny; strokeWidth za gruby dla długości
 * kończyn zlewał się w plamę -> pocieniony; ręce miały prawie identyczne
 * współrzędne w obu klatkach -> dostały realny wymach; noga z tyłu
 * zmieniona z wysokiego kolana na "heel kick" wg referencji użytkownika.
 *
 * Zgłoszenie 2026-08-17 (siódma runda): "on jakby skakał, ma biec, ręce
 * nogi do przodu jak każdy normalny człowiek" — wszystkie poprzednie wersje
 * przełączały się między dwiema pozycjami SKOKOWO (steps/duration:0, zero
 * interpolacji) — to zawsze będzie wyglądać jak teleportowanie/
 * przeskakiwanie między klatkami, nie jak bieg, niezależnie od tego, jak
 * dobre są same pozycje. Wcześniejszy zakaz płynnej
 * interpolacji dotyczył ZUPEŁNIE INNEGO mechanizmu — `scaleX(-1)` całej
 * sylwetki, które w połowie przejścia spłaszczało się do zera i wyglądało
 * jak wirowanie. Tutaj nie ma żadnego mirror'owania — każdy staw (biodro,
 * kolano, stopa, dłoń) ma własne, niezależne współrzędne w klatce A i B, i
 * są one PŁYNNIE tweenowane (interpolate + Easing.inOut) tam i z powrotem
 * w pętli — to jest dokładnie to, jak działają wszystkie 2-klatkowe cykle
 * biegu w prawdziwej animacji (tweening pomiędzy pozycjami kończyn, nie
 * cięcia). Głowa+tułów nadal całkowicie statyczne — biegacz nigdy się nie
 * odwraca ani nie podskakuje w pionie, rusza się tylko szkielet kończyn.
 */
export function LoadingRunner({ size = 48 }: { size?: number }) {
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(withTiming(1, { duration: 260, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [phase]);

  // Wspólny biodro/bark: (17,25) / (23,12). Klatka A = szeroki wykrok
  // (kontakt ze stopą), klatka B = faza przenoszenia (noga z przodu
  // podkurzona, noga z tyłu kopnięta piętą do pośladka).
  const leg1A: Point[] = [
    [17, 25],
    [26, 32],
    [34, 42],
  ];
  const leg1B: Point[] = [
    [17, 25],
    [25, 29],
    [23, 38],
  ];
  const leg2A: Point[] = [
    [17, 25],
    [10, 33],
    [4, 40],
  ];
  const leg2B: Point[] = [
    [17, 25],
    [9, 23],
    [11, 31],
  ];
  const arm1A: Point[] = [
    [23, 12],
    [35, 15],
  ];
  const arm1B: Point[] = [
    [23, 12],
    [8, 16],
  ];
  const arm2A: Point[] = [
    [23, 12],
    [6, 19],
  ];
  const arm2B: Point[] = [
    [23, 12],
    [34, 18],
  ];

  const leg1Props = usePathProps(phase, leg1A, leg1B);
  const leg2Props = usePathProps(phase, leg2A, leg2B);
  const arm1Props = usePathProps(phase, arm1A, arm1B);
  const arm2Props = usePathProps(phase, arm2A, arm2B);
  const leg1CapProps = useCapProps(phase, leg1A[2], leg1B[2]);
  const leg2CapProps = useCapProps(phase, leg2A[2], leg2B[2]);
  const arm1CapProps = useCapProps(phase, arm1A[1], arm1B[1]);
  const arm2CapProps = useCapProps(phase, arm2A[1], arm2B[1]);

  const limbProps = { stroke: Brand.primary, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };

  return (
    <View style={[styles.root, { width: size * 1.6, height: size * 1.6 }]}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={6} r={4} fill={Brand.primary} />
        <Path d="M23 12 L17 25" {...limbProps} />
        <AnimatedPath animatedProps={leg1Props} {...limbProps} />
        <AnimatedCircle animatedProps={leg1CapProps} r={2.3} fill={Brand.primary} />
        <AnimatedPath animatedProps={leg2Props} {...limbProps} />
        <AnimatedCircle animatedProps={leg2CapProps} r={2.3} fill={Brand.primary} />
        <AnimatedPath animatedProps={arm1Props} {...limbProps} />
        <AnimatedCircle animatedProps={arm1CapProps} r={2} fill={Brand.primary} />
        <AnimatedPath animatedProps={arm2Props} {...limbProps} />
        <AnimatedCircle animatedProps={arm2CapProps} r={2} fill={Brand.primary} />
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
