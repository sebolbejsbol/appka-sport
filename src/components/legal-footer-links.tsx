import { router, usePathname, type Href } from 'expo-router';
import { View, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { openLegalDocument } from '@/lib/legal-navigation';

type Props = {
  style?: StyleProp<ViewStyle>;
};

export function LegalFooterLinks({ style }: Props) {
  const pathname = usePathname();
  const returnTo = (pathname || '/(auth)') as Href;

  return (
    <View style={[styles.row, style]}>
      <Pressable onPress={() => openLegalDocument('terms', returnTo)} hitSlop={6}>
        <Text style={styles.link}>{t('legal.termsLink')}</Text>
      </Pressable>
      <Text style={styles.sep}>{t('legal.footerSeparator')}</Text>
      <Pressable onPress={() => openLegalDocument('privacy', returnTo)} hitSlop={6}>
        <Text style={styles.link}>{t('legal.privacyLink')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  link: {
    fontSize: 12,
    color: '#9a9a9a',
    textDecorationLine: 'underline',
  },
  sep: {
    fontSize: 12,
    color: '#c4c4c4',
  },
});
