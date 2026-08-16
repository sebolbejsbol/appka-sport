import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { useAppMenu } from '@/components/app-side-menu';
import { EventMetaBadges } from '@/components/event-meta-badges';
import { FieldOpinionsSheet } from '@/components/field-opinions-sheet';
import { FieldRatingStars } from '@/components/field-rating-stars';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useEventFilters } from '@/context/event-filters';
import { useSession } from '@/context/session';
import type { LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import {
  getEventsForField,
  joinEvent,
  leaveEvent,
  leaveEventWaitlist,
  type EventSummary,
} from '@/lib/events';
import { formatCourtName, formatFieldSport, parseStoredFieldName } from '@/lib/field-display';
import { bucketEventsBySport } from '@/lib/field-event-breakdown';
import { reverseGeocode } from '@/lib/map-geocoding';
import { previewEventNotes, previewEventTitle } from '@/lib/event-display';
import { formatPlayersCount, formatRatingCount } from '@/lib/plural-pl';
import { applyEventFilters } from '@/lib/event-filters';
import type { CourtAvailability, FieldPoint } from '@/lib/fields';
import { listMyFavoriteFieldIds, toggleFieldFavorite } from '@/lib/favorites';
import { getAvailabilityColor, getAvailabilityLabel } from '@/lib/map-theme';
import { requestFavoritesRefresh } from '@/lib/map-field-sync';
import { cancelEventReminders, scheduleEventReminders } from '@/lib/push-notifications';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { fieldMarkerEmoji } from '@/lib/sports';
import { notifyError, notifySuccess } from '@/lib/toast';

type Props = {
  field: FieldPoint | null;
  userCoords: LngLat | null;
  onClose: () => void;
};

export function FieldDetailSheet({ field, userCoords, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const userId = session?.user?.id;

  const { filters } = useEventFilters();

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [opinionsOpen, setOpinionsOpen] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const heartScale = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));

  const fieldId = field?.id;

  const { hideNav, showNav } = useAppMenu();
  useEffect(() => {
    if (!fieldId) return;
    hideNav();
    return () => showNav();
  }, [fieldId, hideNav, showNav]);

  useEffect(() => {
    if (!fieldId) {
      setIsFavorited(false);
      return;
    }
    let active = true;
    void listMyFavoriteFieldIds().then(({ data }) => {
      if (active) setIsFavorited(data.includes(fieldId));
    });
    return () => {
      active = false;
    };
  }, [fieldId]);

  async function handleToggleFavorite() {
    if (!fieldId || favoriteBusy) return;
    setFavoriteBusy(true);
    const previous = isFavorited;
    setIsFavorited(!previous);
    heartScale.value = withSequence(
      withSpring(1.35, { damping: 8, stiffness: 300 }),
      withSpring(1, { damping: 10, stiffness: 260 }),
    );
    const { isFavorited: result, error } = await toggleFieldFavorite(fieldId);
    setFavoriteBusy(false);
    if (error || result === null) {
      setIsFavorited(previous);
      notifyError(t('favorites.error'));
      return;
    }
    setIsFavorited(result);
    notifySuccess(result ? t('favorites.added') : t('favorites.removed'));
    // Odśwież mapę od razu, żeby ulubione boisko natychmiast pojawiło się
    // (lub zniknęło) z wymuszonej widoczności, bez czekania na focus ekranu.
    // Lekkie odświeżenie — ulubione nie zmieniają danych boisk/eventów, więc
    // pełny requestMapFieldsRefresh() (discover + cały bbox od nowa) byłby
    // marnotrawstwem i widocznym, chaotycznym przeładowaniem całej mapy pod
    // otwartym właśnie arkuszem szczegółów.
    requestFavoritesRefresh();
  }

  const loadEvents = useCallback(async () => {
    if (!fieldId) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await getEventsForField(fieldId);
    setEvents(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId) {
      setEvents([]);
      return;
    }
    void loadEvents();
  }, [fieldId, loadEvents]);

  const storedStreet = useMemo(() => parseStoredFieldName(field?.name).street, [field?.name]);

  // Jeśli obiekt nie ma zapisanej ulicy, dociągamy adres z współrzędnych,
  // żeby przy każdym obiekcie była podana ulica.
  useEffect(() => {
    if (!field || storedStreet) {
      setGeoAddress(null);
      return;
    }
    let active = true;
    setGeoAddress(null);
    void reverseGeocode([field.lng, field.lat]).then((addr) => {
      if (!active || !addr) return;
      setGeoAddress(addr.replace(/,\s*(Polska|Poland)\s*$/i, '').trim());
    });
    return () => {
      active = false;
    };
  }, [field?.id, field?.lng, field?.lat, storedStreet]);

  async function handleJoin(event: EventSummary) {
    setBusyId(event.id);
    const result = await joinEvent(event.id);
    setBusyId(null);
    if (result === 'joined' || result === 'already_joined') {
      await scheduleEventReminders({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
      });
    }
    if (
      result === 'joined' ||
      result === 'already_joined' ||
      result === 'waitlisted' ||
      result === 'already_waitlisted'
    ) {
      void loadEvents();
    }
  }

  async function handleLeave(event: EventSummary) {
    if (!userId) return;
    if (event.creator_id === userId) {
      notifyError(t('event.errors.organizerCannotLeave'));
      return;
    }
    setBusyId(event.id);
    const result = await leaveEvent(event.id);
    setBusyId(null);
    if (result === 'organizer_cannot_leave') {
      notifyError(t('event.errors.organizerCannotLeave'));
      return;
    }
    await cancelEventReminders(event.id);
    void loadEvents();
  }

  async function handleLeaveWaitlist(event: EventSummary) {
    if (!userId) return;
    setBusyId(event.id);
    await leaveEventWaitlist(event.id);
    setBusyId(null);
    await cancelEventReminders(event.id);
    void loadEvents();
  }

  function handleCreate() {
    if (!field) return;
    onClose();
    router.push({
      pathname: '/event/create',
      params: {
        fieldId: field.id,
        fieldName: field.name ?? '',
        fieldSport: field.sport ?? '',
        fieldLng: String(field.lng),
        fieldLat: String(field.lat),
      },
    });
  }

  const visibleEvents = useMemo(() => {
    if (!field) return [];
    const withCoords = events.map((event) => ({
      ...event,
      field_id: field.id,
      field_lng: field.lng,
      field_lat: field.lat,
    }));
    return applyEventFilters(withCoords, filters, { userCoords });
  }, [events, field, filters, userCoords]);

  const eventsByCategory = useMemo(() => bucketEventsBySport(visibleEvents), [visibleEvents]);

  if (!field) return null;

  const stored = parseStoredFieldName(field.name);
  const placeName = formatCourtName(field.name, field.sport);
  const addressText = stored.street ?? geoAddress;
  const distanceText =
    userCoords != null
      ? `${formatDistance(distanceMeters(userCoords, [field.lng, field.lat]))} ${t('field.fromYou')}`
      : null;
  const availability: CourtAvailability = field.availability ?? 'empty';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />

        {field.photo_url ? (
          <Image source={{ uri: field.photo_url }} style={styles.photo} resizeMode="cover" />
        ) : null}

        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.titleFlex]} numberOfLines={1}>{placeName}</Text>
          <Pressable
            onPress={() => void handleToggleFavorite()}
            disabled={favoriteBusy}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={isFavorited ? t('favorites.removeAction') : t('favorites.addAction')}
            style={({ pressed }) => [styles.favoriteBtn, pressed && styles.favoriteBtnPressed]}>
            <Animated.Text style={[styles.favoriteIcon, heartStyle]}>
              {isFavorited ? '❤️' : '🤍'}
            </Animated.Text>
          </Pressable>
        </View>
        {addressText ? <Text style={styles.subtitle}>{addressText}</Text> : null}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatFieldSport(field.sport)}</Text>
          {distanceText ? <Text style={styles.metaText}>· {distanceText}</Text> : null}
        </View>

        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: getAvailabilityColor(availability) }]} />
          <Text style={[styles.statusBadgeText, { color: getAvailabilityColor(availability) }]}>
            {getAvailabilityLabel(availability)}
          </Text>
        </View>

        {eventsByCategory.length > 0 ? (
          <View style={styles.categoryChips}>
            {eventsByCategory.map((c) => (
              <View key={c.sport} style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>
                  {fieldMarkerEmoji(c.sport)} {c.count} {t('field.activeEvents')}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>{t('field.eventsTitle')}</Text>

        {loading ? (
          <ActivityIndicator color={Brand.primary} style={styles.loader} />
        ) : loadError ? (
          <Text style={styles.muted}>{t('field.eventsError')}</Text>
        ) : visibleEvents.length === 0 ? (
          <Text style={styles.muted}>{t('field.eventsEmpty')}</Text>
        ) : (
          <ScrollView style={styles.eventList} keyboardShouldPersistTaps="handled">
            {visibleEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                busy={busyId === event.id}
                onOpenDetail={() => {
                  onClose();
                  router.push({ pathname: '/event/[id]', params: { id: event.id } });
                }}
                onJoin={() => handleJoin(event)}
                onLeave={() => handleLeave(event)}
                onLeaveWaitlist={() => handleLeaveWaitlist(event)}
              />
            ))}
          </ScrollView>
        )}

        <Pressable
          style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
          onPress={handleCreate}>
          <Text style={styles.createButtonText}>{t('field.createEvent')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

type EventRowProps = {
  event: EventSummary;
  busy: boolean;
  onOpenDetail: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onLeaveWaitlist?: () => void;
};

function EventRow({ event, busy, onOpenDetail, onJoin, onLeave, onLeaveWaitlist }: EventRowProps) {
  const isFull =
    event.max_players != null && event.participant_count >= event.max_players && !event.is_joined;

  const playersText = formatPlayersCount(event.participant_count, event.max_players);

  return (
    <Pressable
      style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
      onPress={onOpenDetail}>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTime}>{formatEventDateTime(event.starts_at)}</Text>
        {event.title ? <Text style={styles.eventTitle}>{event.title}</Text> : null}
        <Text style={styles.eventMeta}>
          {playersText}
          {event.creator_nick ? ` · ${t('event.organizer')}: ${event.creator_nick}` : ''}
        </Text>
      </View>

      {event.is_joined ? (
        <Pressable
          style={({ pressed }) => [styles.leaveBtn, pressed && styles.pressed]}
          onPress={onLeave}
          disabled={busy}>
          <Text style={styles.leaveBtnText}>{t('event.leave')}</Text>
        </Pressable>
      ) : isFull ? (
        <View style={[styles.joinBtn, styles.fullBtn]}>
          <Text style={styles.fullBtnText}>{t('event.full')}</Text>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}
          onPress={onJoin}
          disabled={busy}>
          <Text style={styles.joinBtnText}>{t('event.join')}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    ...shadow('up'),
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingBottom: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Brand.border,
    marginBottom: 14,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: Brand.surfaceMuted,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  categoryChip: {
    backgroundColor: Brand.surfaceMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleFlex: {
    flex: 1,
  },
  favoriteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceMuted,
  },
  favoriteBtnPressed: {
    opacity: 0.7,
  },
  favoriteIcon: {
    fontSize: 18,
  },
  subtitle: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 14,
    color: Brand.textSecondary,
  },
  ratingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  opinionsBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  opinionsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 18,
    marginBottom: 10,
  },
  loader: {
    marginVertical: 16,
  },
  muted: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingVertical: 8,
  },
  eventList: {
    gap: 0,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    gap: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTime: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  eventTitle: {
    fontSize: 14,
    color: Brand.textPrimary,
    marginTop: 2,
  },
  eventMeta: {
    fontSize: 13,
    color: Brand.textSecondary,
    marginTop: 2,
  },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  joinBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.primaryText,
  },
  fullBtn: {
    backgroundColor: Brand.screenBackground,
  },
  fullBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textMuted,
  },
  waitlistBtn: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  waitlistBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.primary,
  },
  leaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  leaveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  createButton: {
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Brand.primary,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: Brand.primaryText,
  },
  pressed: {
    opacity: 0.8,
  },
});
