import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Brand } from '@/constants/theme';

/**
 * Ta apka jest zaprojektowana mobile-first (natywny RN). Na szerokim ekranie
 * przeglądarki bez żadnych ograniczeń wygląda na rozciągniętą stronę mobilną
 * (pełna szerokość przycisków, ogromne puste przestrzenie). Zamiast przepisywać
 * dziesiątki ekranów, centrujemy całą aplikację w stałej, "telefonopodobnej"
 * kolumnie na szerokich ekranach — to samo demo co np. WhatsApp Web / X —
 * i zostawiamy layout bez zmian poniżej progu (telefon = identyczny UI co natywnie).
 */
const MAX_WIDTH = 720;
const BREAKPOINT = 760;

export function WebAppShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();

  if (Platform.OS !== 'web' || width < BREAKPOINT) {
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
