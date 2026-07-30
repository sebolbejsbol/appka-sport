import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';

// Na web nie renderujemy natywnej mapy Mapbox (to biblioteka mobilna).
// Wersję webową mapy dołożymy później osobno (Mapbox GL JS).
export function AppMap() {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🗺️</Text>
      <Text style={styles.title}>{t('map.webOnlyTitle')}</Text>
      <Text style={styles.body}>{t('map.webOnlyBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Brand.screenBackground,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: Brand.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
  },
});
