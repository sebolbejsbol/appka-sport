import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppBrandMark } from '@/components/app-brand-mark';
import { Button } from '@/components/button';
import { LegalFooterLinks } from '@/components/legal-footer-links';
import { Brand } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { t } from '@/i18n';

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={[styles.hero, { paddingTop: insets.top + 56 }]}>
        <AppBrandMark size={250} />
        <Text style={styles.subtitle}>{t('welcome.subtitle')}</Text>
      </View>

      <View style={[styles.buttons, { paddingBottom: insets.bottom + 28 }]}>
        <Button label={t('welcome.login')} onPress={() => router.push('/sign-in')} />
        <Button
          label={t('welcome.register')}
          variant="secondary"
          onPress={() => router.push('/sign-up')}
        />
        <Text style={styles.footer}>{t('welcome.footer')}</Text>
        <LegalFooterLinks style={styles.legalFooter} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 44,
    gap: 16,
  },
  subtitle: {
    ...Typography.bodySecondary,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 320,
  },
  buttons: {
    gap: 12,
    paddingHorizontal: 24,
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 20,
    lineHeight: 18,
  },
  legalFooter: {
    marginTop: 8,
  },
});
