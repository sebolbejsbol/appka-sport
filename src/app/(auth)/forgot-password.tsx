import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { t } from '@/i18n';
import { mapAuthError } from '@/lib/auth-errors';
import { passwordResetRedirectUrl } from '@/lib/auth-linking';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    const emailError = validateEmail(email);
    setError(emailError);
    setFormError(undefined);
    if (emailError) return;

    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectUrl(),
    });
    setSubmitting(false);

    if (resetError) {
      setFormError(mapAuthError(resetError));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <View
        style={[
          styles.successContainer,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}>
        <View style={styles.successHeader}>
          <Text style={styles.successTitle}>{t('forgotPassword.sentTitle')}</Text>
          <Text style={styles.successBody}>{t('forgotPassword.sentBody')}</Text>
        </View>
        <Button label={t('forgotPassword.backToLogin')} onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader insetTop={insets.top} onBack={() => goBack('/sign-in')} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('forgotPassword.title')}</Text>
        <Text style={styles.lead}>{t('forgotPassword.lead')}</Text>

        <View style={styles.form}>
          <TextField
            label={t('common.email')}
            value={email}
            onChangeText={setEmail}
            error={error}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!submitting}
          />

          {!!formError && <Text style={styles.formError}>{formError}</Text>}

          <Button
            label={submitting ? t('common.loading') : t('forgotPassword.submit')}
            onPress={handleSubmit}
            disabled={submitting}
            style={styles.submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  title: {
    ...Typography.screenTitle,
    marginBottom: 8,
  },
  lead: {
    ...Typography.bodySecondary,
    marginBottom: 28,
  },
  form: {
    gap: 20,
  },
  formError: {
    fontSize: 14,
    color: Brand.danger,
    fontWeight: '500',
  },
  submit: {
    marginTop: 8,
  },
  successContainer: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  successHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 16,
    color: Brand.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
