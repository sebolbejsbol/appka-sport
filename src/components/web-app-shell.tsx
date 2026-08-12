import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Brand } from '@/constants/theme';

/**
 * Ta apka jest zaprojektowana mobile-first (natywny RN). Poniżej progu
 * DESKTOP_NAV_BREAKPOINT layout zostaje bez zmian (telefon = identyczny UI co
 * natywnie). Powyżej progu centrujemy aplikację w szerokiej, "desktopowej"
 * ramce z widocznym paskiem bocznym (patrz <AppMenuProvider /> w
 * app-side-menu.tsx, który dokłada tam stałe menu zamiast hamburgera) —
 * podobnie jak WhatsApp Web / X pokazują pełny layout aplikacji, a nie
 * rozciągnięty widok mobilny.
 */
const MAX_WIDTH = 1280;
/** Współdzielony z app-side-menu.tsx — od tej szerokości pokazujemy stały sidebar zamiast hamburgera. */
export const DESKTOP_NAV_BREAKPOINT = 760;

export function WebAppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width < DESKTOP_NAV_BREAKPOINT) {
    return <>{children}</>;
  }

  return (
    <View style={styles.backdrop}>
      <View style={styles.frame}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#dbe3f0',
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: MAX_WIDTH,
    backgroundColor: Brand.screenBackground,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 0 48px rgba(10, 14, 22, 0.14)' } as object)
      : null),
  },
});
