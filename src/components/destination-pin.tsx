import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/theme';
import { shadow } from '@/constants/ui';

/**
 * Znacznik celu na mapie nawigacji (src/components/field-navigate-screen.tsx
 * /.web.tsx) — zgłoszenie: poprzedni znacznik był zwykłym niebieskim kółkiem
 * (CircleLayer, circleColor: Brand.primary), DOKŁADNIE tym samym kolorem co
 * niebieska kropka LocationPuck (aktualna pozycja użytkownika, patrz
 * .app-location-puck-dot w map-kit-web.tsx) — na mapie z trasą między nimi
 * dwa identyczne niebieskie kółka myliły się ze sobą. Teraz: kształt pinezki
 * (nie kółko) w Brand.danger (czerwony) zamiast Brand.primary (niebieski) —
 * inny kształt I inny kolor, nie da się pomylić z kropką lokalizacji.
 */
export function DestinationPin({ size = 36 }: { size?: number }) {
  return (
    <View style={[shadow('md'), { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 -960 960 960">
        <Path
          fill={Brand.danger}
          d="M458.5-103.5Q448-107 440-115q-42-38-91-87.5T258-309q-42-57-70-119t-28-124q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 62-28 124t-70 119q-42 57-91 106.5T520-115q-8 8-18.5 11.5T480-100q-11 0-21.5-3.5Zm71-407Q550-531 550-560t-20.5-49.5Q509-630 480-630t-49.5 20.5Q410-589 410-560t20.5 49.5Q451-490 480-490t49.5-20.5Z"
        />
      </Svg>
    </View>
  );
}
