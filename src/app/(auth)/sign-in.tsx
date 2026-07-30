import { router, type Href } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { LegalFooterLinks } from '@/components/legal-footer-links';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { t } from '@/i18n';
import { mapAuthError } from '@/lib/auth-errors';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { validateEmail, validatePassword } from '@/lib/validation';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const nextErrors = {
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(nextErrors);
    setFormError(undefined);

    if (nextErrors.email || nextErrors.password) {
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (error) {
      setFormError(mapAuthError(error));
    }
    // Sukces: zmianę sesji wychwyci SessionProvider i przekieruje do (app).
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader insetTop={insets.top} onBack={() => goBack('/')} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('signIn.title')}</Text>
        <Text style={styles.lead}>{t('welcome.subtitle')}</Text>

        <View style={styles.form}>
          <TextField
            label={t('common.email')}
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            editable={!submitting}
          />
          <TextField
            label={t('common.password')}
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            passwordToggle
            autoComplete="password"
            textContentType="password"
            editable={!submitting}
          />

          <Pressable
            onPress={() => router.push('/forgot-password' as Href)}
            hitSlop={8}
            disabled={submitting}
            style={styles.forgotPasswordRow}>
            <Text style={styles.forgotPasswordText}>{t('signIn.forgotPassword')}</Text>
          </Pressable>

          {!!formError && <Text style={styles.formError}>{formError}</Text>}

          <Button
            label={submitting ? t('common.loading') : t('signIn.submit')}
            onPress={handleSubmit}
            disabled={submitting}
            style={styles.submit}
          />
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{t('signIn.noAccount')} </Text>
          <Pressable onPress={() => router.replace('/sign-up')} hitSlop={8} disabled={submitting}>
            <Text style={styles.switchLink}>{t('signIn.goRegister')}</Text>
          </Pressable>
        </View>

        <LegalFooterLinks style={styles.legalFooter} />
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
  forgotPasswordRow: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textSecondary,
    textDecorationLine: 'underline',
  },
  formError: {
    fontSize: 14,
    color: Brand.danger,
    fontWeight: '500',
  },
  submit: {
    marginTop: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  switchText: {
    fontSize: 15,
    color: Brand.textSecondary,
  },
  switchLink: {
    ...Typography.link,
  },
  legalFooter: {
    marginTop: 28,
    marginBottom: 8,
  },
});
