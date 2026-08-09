import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppleIcon, FacebookIcon, GoogleIcon } from '@/components/provider-icons';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { signInWithProvider, type OAuthProvider } from '@/lib/oauth';

type Props = {
  /** Wyłącza wszystkie przyciski (np. gdy formularz e-mail już coś wysyła). */
  disabled?: boolean;
  onError?: (message: string) => void;
};

/**
 * Przyciski „Kontynuuj z…" dla Google / Facebook / Apple. Sam login (redirect
 * na webie, sesja przeglądarki w aplikacji) obsługuje src/lib/oauth.ts —
 * powodzenie wychwytuje SessionProvider przez onAuthStateChange, więc po
 * udanym logowaniu ten komponent nie musi nigdzie nawigować.
 */
export function OAuthButtons({ disabled, onError }: Props) {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const busy = pending !== null || disabled;

  async function handlePress(provider: OAuthProvider) {
    if (busy) return;
    setPending(provider);
    const { error, cancelled } = await signInWithProvider(provider);
    setPending(null);
    if (cancelled) return;
    if (error) {
      onError?.(t('oauth.genericError'));
    }
    // Sukces: SessionProvider wychwyci zmianę sesji i przekieruje samo.
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabel}>{t('oauth.dividerLabel')}</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.buttons}>
        <ProviderButton
          icon={<GoogleIcon size={18} />}
          label={t('oauth.continueWithGoogle')}
          variant="light"
          loading={pending === 'google'}
          disabled={busy}
          onPress={() => handlePress('google')}
        />
        <ProviderButton
          icon={<FacebookIcon size={18} />}
          label={t('oauth.continueWithFacebook')}
          variant="light"
          loading={pending === 'facebook'}
          disabled={busy}
          onPress={() => handlePress('facebook')}
        />
        <ProviderButton
          icon={<AppleIcon size={18} />}
          label={t('oauth.continueWithApple')}
          variant="dark"
          loading={pending === 'apple'}
          disabled={busy}
          onPress={() => handlePress('apple')}
        />
      </View>
    </View>
  );
}

type ProviderButtonProps = {
  icon: React.ReactNode;
  label: string;
  variant: 'light' | 'dark';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ProviderButton({ icon, label, variant, loading, disabled, onPress }: ProviderButtonProps) {
  const isDark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.providerBtn,
        isDark ? styles.providerBtnDark : styles.providerBtnLight,
        disabled && styles.providerBtnDisabled,
        pressed && !disabled && styles.providerBtnPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={isDark ? '#ffffff' : Brand.textPrimary} size="small" />
      ) : (
        <>
          <View style={styles.providerIcon}>{icon}</View>
          <Text style={[styles.providerLabel, isDark && styles.providerLabelDark]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Brand.border,
  },
  dividerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  buttons: {
    gap: 10,
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 50,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
  },
  providerBtnLight: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
  },
  providerBtnDark: {
    backgroundColor: '#000000',
  },
  providerBtnDisabled: {
    opacity: 0.5,
  },
  providerBtnPressed: {
    opacity: 0.85,
  },
  providerIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  providerLabelDark: {
    color: '#ffffff',
  },
});
