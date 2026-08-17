import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event-card';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import type { LocationStatus } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import type { DiscoverEvent } from '@/lib/discover-events';
import type { LngLat } from '@/lib/geo';
import { getGeoDiagTrail } from '@/lib/geo-diag';
import { isIOSWebBrowser } from '@/lib/get-web-location';

type Props = {
  visible: boolean;
  onClose: () => void;
  events: DiscoverEvent[];
  userCoords: LngLat | null;
  locationStatus: LocationStatus;
  onRetryLocation: () => void;
  onSelectEvent: (event: DiscoverEvent) => void;
};

/**
 * Panel przycisku "Szukaj w pobliżu" — lista AKTYWNYCH wydarzeń w promieniu do
 * NEARBY_RADIUS_KM (patrz map-view.tsx/.web.tsx) od użytkownika, zawsze zgodna
 * z aktualnie ustawionymi filtrami mapy (sport, poziom, data...) — to jest
 * gotowa, przefiltrowana lista przekazana z rodzica, ten komponent tylko ją
 * renderuje + obsługuje stan "jeszcze nie mamy lokalizacji"/"pusto".
 */
export function NearbyEventsSheet({
  visible,
  onClose,
  events,
  userCoords,
  locationStatus,
  onRetryLocation,
  onSelectEvent,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={styles.headerMain}>
              <Text style={styles.title}>📍 {t('map.nearbyEventsTitle')}</Text>
              <Text style={styles.subtitle}>{t('map.nearbyEventsSubtitle')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {!userCoords &&
          (locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'timeout') ? (
            // Na webie kliknięcie "Szukaj w pobliżu" już samo w sobie
            // aktywnie prosi o lokalizację (patrz get-web-location.ts) —
            // ten stan znaczy więc realną odmowę/błąd, nie "jeszcze nie
            // pytano", stąd te same ujednolicone komunikaty co reszta akcji
            // lokalizacyjnych na webie. "denied" nie dostaje przycisku
            // ponawiania — przeglądarka i tak nie pokaże już promptu.
            <View style={styles.stateWrap}>
              <Text style={styles.stateEmoji}>📍</Text>
              <Text style={styles.stateText}>
                {locationStatus === 'denied'
                  ? Platform.OS === 'web'
                    ? isIOSWebBrowser()
                      ? t('location.permissionDeniedIOS')
                      : t('location.permissionDeniedAndroid')
                    : t('map.nearbyEventsLocationDenied')
                  : Platform.OS === 'web'
                    ? locationStatus === 'timeout'
                      ? t('location.timeout')
                      : t('location.unavailable')
                    : t('map.nearbyEventsLocationUnavailable')}
              </Text>
              {locationStatus !== 'denied' ? (
                <Pressable onPress={onRetryLocation} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
                </Pressable>
              ) : null}
              {/* TYMCZASOWE (2026-08-17, patrz geo-diag.ts): pokazuje ostatnie
                  kroki diagnostyczne wprost pod błędem, żeby dało się
                  zrzutem ekranu ustalić DOKŁADNY kod błędu geolokalizacji
                  bez zdalnego debugowania. Usunąć razem z resztą geoDiag. */}
              {Platform.OS === 'web' ? (
                <Text style={styles.diagText} selectable>
                  {getGeoDiagTrail(6)}
                </Text>
              ) : null}
            </View>
          ) : !userCoords ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator color={Brand.primary} />
              <Text style={styles.stateText}>{t('map.nearbyEventsLocating')}</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateEmoji}>🔍</Text>
              <Text style={styles.stateText}>{t('map.nearbyEventsEmpty')}</Text>
            </View>
          ) : (
            <FlatList
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <EventCard event={item} userCoords={userCoords} onPress={onSelectEvent} />
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: Brand.screenBackground,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '80%',
    ...shadow('up'),
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.border,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Brand.textMuted,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
  },
  close: {
    fontSize: 18,
    color: Brand.textMuted,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  stateEmoji: {
    fontSize: 32,
  },
  stateText: {
    fontSize: 14,
    color: Brand.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
  },
  diagText: {
    marginTop: 12,
    fontSize: 10,
    color: Brand.textMuted,
    textAlign: 'left',
    paddingHorizontal: 12,
  },
  list: {
    gap: 12,
    paddingBottom: 12,
  },
});
