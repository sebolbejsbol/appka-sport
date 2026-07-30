import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';

export type FieldReportLocation = {
  lng: number;
  lat: number;
};

type Props = {
  value: FieldReportLocation | null;
  onChange: (location: FieldReportLocation | null) => void;
};

/** Web: wybór punktu na mapie wymaga wersji natywnej. */
export function FieldReportLocationPicker(_props: Props) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{t('map.webOnlyBody')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  text: {
    fontSize: 14,
    color: Brand.textSecondary,
    textAlign: 'center',
  },
});
