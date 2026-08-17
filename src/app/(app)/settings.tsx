import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { Button } from '@/components/button';
import { LegalFooterLinks } from '@/components/legal-footer-links';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useLocale } from '@/context/locale';
import { useSession } from '@/context/session';
import { useUserLocation } from '@/hooks/use-user-location';
import { t, SUPPORTED_LOCALES } from '@/i18n';
import { deleteMyAccount } from '@/lib/account';
import { confirmAction } from '@/lib/confirm';
import { getNotificationsEnabled, setNotificationsEnabled } from '@/lib/notification-preferences';
import { getUpcomingEvents } from '@/lib/events';
import { canOpenLocationSettings, openLocationSettings } from '@/lib/location-permission';
import {
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermissionState,
  syncLocalEventReminders,
} from '@/lib/push-notifications';
import { hasExpoPushToken, setOwnLanguage } from '@/lib/profiles';
import {
  disableWebPush,
  enableWebPush,
  getWebPushPermissionState,
  hasActiveWebPushSubscription,
  webPushSupport,
} from '@/lib/web-push';
import type { Locale } from '@/i18n';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const { locale, setLocale } = useLocale();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'undetermined'>(
    'undetermined',
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const {
    status: locationStatus,
    requestLocation,
  } = useUserLocation();

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    if (Platform.OS === 'web') {
      const hasSub = await hasActiveWebPushSubscription();
      setEnabled(hasSub);
      setPermission(getWebPushPermissionState());
      setLoading(false);
      return;
    }

    let pref = await getNotificationsEnabled();
    if (!pref) {
      const hasToken = await hasExpoPushToken(userId);
      if (hasToken) {
        await setNotificationsEnabled(true);
        pref = true;
      }
    }
    const perm = await getNotificationPermissionState();
    setEnabled(pref);
    setPermission(perm);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleToggle(next: boolean) {
    setBusy(true);
    setHint(null);

    if (Platform.OS === 'web') {
      if (next) {
        const result = await enableWebPush();
        if (result.ok) {
          setEnabled(true);
          setPermission('granted');
        } else {
          setEnabled(false);
          setPermission(getWebPushPermissionState());
          if (result.reason === 'permission_denied') {
            setHint(t('settings.notificationsPermissionDenied'));
          } else {
            setHint(t('settings.notificationsEnableFailed'));
          }
        }
      } else {
        await disableWebPush();
        setEnabled(false);
      }
      setBusy(false);
      return;
    }

    if (next) {
      const result = await enablePushNotifications();
      if (result.ok) {
        setEnabled(true);
        setPermission('granted');
        const { data } = await getUpcomingEvents('mine');
        await syncLocalEventReminders(data);
      } else {
        const perm = await getNotificationPermissionState();
        setPermission(perm);
        setEnabled(false);
        if (result.reason === 'fcm_not_configured') {
          setHint(t('settings.notificationsFcmMissing'));
        } else if (result.reason === 'permission_denied' || perm === 'denied') {
          setHint(t('settings.notificationsPermissionDenied'));
        } else {
          setHint(t('settings.notificationsEnableFailed'));
        }
      }
    } else {
      await disablePushNotifications();
      setEnabled(false);
    }

    setBusy(false);
  }

  async function handleLanguageChange(next: Locale) {
    await setLocale(next);
    // Zapis preferencji w profilu, aby po ponownym logowaniu język był zachowany.
    void setOwnLanguage(next);
  }

  function handleSignOut() {
    confirmAction(
      t('settings.signOutConfirmTitle'),
      t('settings.signOutConfirmBody'),
      t('settings.signOut'),
      t('common.cancel'),
      () => void signOut(),
      true,
    );
  }

  function handleDeleteAccount() {
    confirmAction(
      t('settings.deleteAccountConfirmTitle'),
      t('settings.deleteAccountConfirmBody'),
      t('settings.deleteAccountConfirmAction'),
      t('common.cancel'),
      () => void confirmDeleteAccount(),
      true,
    );
  }

  async function confirmDeleteAccount() {
    setBusy(true);
    setHint(null);

    if (Platform.OS === 'web') {
      await disableWebPush();
    } else {
      await disablePushNotifications();
    }
    const result = await deleteMyAccount();

    setBusy(false);

    if (result !== 'deleted') {
      setHint(t('settings.deleteAccountFailed'));
      return;
    }

    await signOut();
  }

  function statusText(): string {
    if (!enabled) return t('settings.notificationsOff');
    if (permission === 'denied') return t('settings.notificationsDenied');
    return t('settings.notificationsOn');
  }

  function locationStatusText(): string {
    switch (locationStatus) {
      case 'granted':
        return t('settings.locationOn');
      case 'denied':
        return t('settings.locationDenied');
      case 'unavailable':
        return t('settings.locationUnavailable');
      default:
        return t('settings.locationChecking');
    }
  }

  return (
    <ScreenScaffold
      title={t('settings.title')}
      insetTop={insets.top}
      insetBottom={insets.bottom + BOTTOM_NAV_HEIGHT}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <View style={styles.sections}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.languageTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.languageHint')}</Text>
            <View style={styles.langRow}>
              {SUPPORTED_LOCALES.map((option) => {
                const active = locale === option.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => void handleLanguageChange(option.code)}
                    disabled={busy}
                    style={[styles.langChip, active && styles.langChipActive]}>
                    <Text style={styles.langFlag}>{option.flag}</Text>
                    <Text style={[styles.langLabel, active && styles.langLabelActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.notificationsTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.notificationsHint')}</Text>

            {Platform.OS === 'web' && webPushSupport() !== 'supported' ? (
              <Text style={styles.status}>{t('settings.notificationsWebUnavailable')}</Text>
            ) : (
              <>
                <Text style={styles.status}>{statusText()}</Text>

                <View style={styles.rowBetween}>
                  <Text style={styles.rowLabel}>{t('settings.notificationsToggle')}</Text>
                  <Switch
                    value={enabled}
                    onValueChange={handleToggle}
                    disabled={busy}
                    trackColor={{ true: Brand.primary }}
                  />
                </View>

                {hint ? <Text style={styles.errorText}>{hint}</Text> : null}

                {permission === 'denied' && Platform.OS !== 'web' ? (
                  <Button
                    label={t('settings.notificationsOpenSettings')}
                    variant="secondary"
                    onPress={() => void Linking.openSettings()}
                    disabled={busy}
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.locationTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.locationHint')}</Text>
            <Text style={styles.status}>{locationStatusText()}</Text>

            {locationStatus !== 'granted' ? (
              <Button
                label={t('settings.locationEnable')}
                variant="secondary"
                onPress={requestLocation}
                disabled={busy}
              />
            ) : null}

            {locationStatus === 'denied' && canOpenLocationSettings ? (
              <Button
                label={t('fieldNavigation.openSettings')}
                variant="secondary"
                onPress={() => void openLocationSettings()}
                disabled={busy}
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.reportFieldTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.reportFieldHint')}</Text>
            <Button
              label={t('settings.reportFieldAction')}
              variant="secondary"
              onPress={() => router.push('/field/report')}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.blockedUsersTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.blockedUsersHint')}</Text>
            <Button
              label={t('settings.blockedUsersAction')}
              variant="secondary"
              onPress={() => router.push('/settings/blocked')}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('settings.accountTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.accountHint')}</Text>
            <Button
              label={t('settings.signOut')}
              variant="secondary"
              onPress={handleSignOut}
              disabled={busy}
            />
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <Text style={styles.dangerTitle}>{t('settings.deleteAccountTitle')}</Text>
            <Text style={styles.cardHint}>{t('settings.deleteAccountHint')}</Text>
            <Pressable
              onPress={handleDeleteAccount}
              disabled={busy}
              style={({ pressed }) => [
                styles.dangerButton,
                pressed && styles.dangerButtonPressed,
                busy && styles.dangerButtonDisabled,
              ]}>
              <Text style={styles.dangerButtonText}>{t('settings.deleteAccountAction')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      <LegalFooterLinks style={styles.legalFooter} />
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  loader: {
    marginTop: 32,
  },
  sections: {
    gap: 16,
    flex: 1,
  },
  card: {
    gap: 12,
    padding: 18,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  cardHint: {
    fontSize: 14,
    color: Brand.textMuted,
  },
  status: {
    fontSize: 14,
    color: Brand.textSecondary,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  rowLabel: {
    fontSize: 16,
    color: Brand.textPrimary,
    flex: 1,
    paddingRight: 12,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
  },
  langRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  langChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  langFlag: {
    fontSize: 18,
  },
  langLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  langLabelActive: {
    color: Brand.primaryText,
  },
  dangerCard: {
    borderColor: '#fecaca',
    backgroundColor: Brand.dangerLight,
  },
  dangerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.danger,
  },
  dangerButton: {
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: Brand.surface,
  },
  dangerButtonPressed: {
    opacity: 0.85,
  },
  dangerButtonDisabled: {
    opacity: 0.5,
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Brand.danger,
  },
  legalFooter: {
    marginTop: 32,
    paddingBottom: 8,
  },
});
