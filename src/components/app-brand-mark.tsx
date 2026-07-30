import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

const LOGO = require('../../assets/images/dudieday-logo.png');

type Props = {
  /** Szerokość (i wysokość) kafelka logo. Logo jest skalowane „contain". */
  size?: number;
  style?: StyleProp<ImageStyle>;
};

/** Logo DUDIE DAY — proporcje 752:509 (po przycięciu czarnych marginesów). */
const LOGO_ASPECT = 752 / 509;

/** Logo DUDIE DAY (przezroczyste) — najlepiej wygląda na ciemnym tle. */
export function AppBrandMark({ size = 220, style }: Props) {
  return (
    <Image
      source={LOGO}
      style={[styles.logo, { width: size, height: size / LOGO_ASPECT }, style]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    alignSelf: 'center',
  },
});
