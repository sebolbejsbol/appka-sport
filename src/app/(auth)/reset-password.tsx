import * as Linking from 'expo-linking';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { mapAuthError } from '@/lib/auth-errors';
import { createSessionFromAuthUrl } from '@/lib/auth-linking';
import { goBack } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { validatePassword } from '@/lib/validation';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { session, clearPasswordRecovery } = useSession();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (session) {
        if (active) setReady(true);
        return;
      }
      const url = await Linking.getInitialURL();
      if (url) {
        const ok = await createSessionFromAuthUrl(url);
        if (active) {
          setReady(ok);
          setLinkError(!ok);
        }
        return;
      }
      if (active) {
        setReady(false);
        setLinkError(true);
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [session]);

  async function handleSubmit() {
    const nextErrors = {
      password: validatePassword(password),
      confirmPassword:
        password !== confirmPassword ? t('errors.passwordMismatch') : undefined,
    };
    setErrors(nextErrors);
    setFormError(undefined);

    if (nextErrors.password || nextErrors.confirmPassword) return;
    if (!session) {
      setFormError(t('resetPassword.linkInvalid'));
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setFormError(mapAuthError(error));
      return;
    }

    clearPasswordRecovery();
    router.replace('/');
  }

  if (linkError && !session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.errorTitle}>{t('resetPassword.linkInvalidTitle')}</Text>
        <Text style={styles.errorBody}>{t('resetPassword.linkInvalid')}</Text>
        <Button
          label={t('resetPassword.requestNewLink')}
          onPress={() => router.replace('/forgot-password' as Href)}
          style={styles.retryBtn}
        />
      </View>
    );
  }

  if (!ready && !session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{t('common.loading')}</Text>
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
        <Text style={styles.title}>{t('resetPassword.title')}</Text>
        <Text style={styles.lead}>{t('resetPassword.lead')}</Text>

        <View style={styles.form}>
          <TextField
            label={t('resetPassword.newPassword')}
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            passwordToggle
            autoComplete="password-new"
            textContentType="newPassword"
            editable={!submitting}
          />
          <TextField
            label={t('resetPassword.confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={errors.confirmPassword}
            passwordToggle
            autoComplete="password-new"
            textContentType="newPassword"
            editable={!submitting}
          />

          {!!formError && <Text style={styles.formError}>{formError}</Text>}

          <Button
            label={submitting ? t('common.loading') : t('resetPassword.submit')}
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  muted: {
    color: Brand.textMuted,
    fontSize: 15,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  errorBody: {
    fontSize: 16,
    color: Brand.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryBtn: {
    minWidth: 220,
  },
});
