import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { CheckInRipple } from '@/components/check-in-ripple';
import { EventBlockedCoPlayerBanner } from '@/components/event-blocked-co-player-banner';
import { FieldRatingPromptModal } from '@/components/field-rating-prompt-modal';
import { EventMetaBadges } from '@/components/event-meta-badges';
import { NavigateToFieldButton } from '@/components/navigate-to-field-button';
import { Button } from '@/components/button';
import { Brand } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { useSession } from '@/context/session';
import { useWatchingLocation } from '@/hooks/use-watching-location';
import { t } from '@/i18n';
import { showActionSheet } from '@/lib/action-sheet-navigation';
import { confirmAction } from '@/lib/confirm';
import { notifyError } from '@/lib/toast';
import { debounce, subscribeToTable } from '@/lib/realtime';
import {
  checkInEvent,
  CHECK_IN_RADIUS_M,
  checkInErrorMessage,
  getCheckInCoords,
  manualCheckInEvent,
  type CheckInResult,
} from '@/lib/check-in';
import { formatEventDateTime } from '@/lib/datetime';
import {
  deleteEvent,
  extendEvent,
  finishEvent,
  getEventDetail,
  joinEvent,
  leaveEvent,
  leaveEventWaitlist,
  removeEventParticipant,
  type EventDetail,
} from '@/lib/events';
import { logInteraction } from '@/lib/interactions';
import { formatCourtName } from '@/lib/field-display';
import { formatFieldSport } from '@/lib/field-display';
import { distanceMeters, formatDistance } from '@/lib/geo';
import { formatPlayersCount } from '@/lib/plural-pl';
import { geoDiag, getGeoDiagTrail } from '@/lib/geo-diag';
import { isIOSWebBrowser } from '@/lib/get-web-location';
import { requireLocationPermission } from '@/lib/location-permission';
import { goBack } from '@/lib/navigation';
import { notifyFieldEventCountDelta } from '@/lib/map-field-sync';
import { cancelEventReminders, scheduleEventReminders } from '@/lib/push-notifications';
import {
  isWithinFieldRatingPromptWindow,
  markFieldRatingPromptHandled,
  wasFieldRatingPromptHandled,
} from '@/lib/field-rating-prompt-storage';
import {
  listEventTeamInvitations,
  listMyPendingTeamEventInvitations,
  respondTeamEventInvitation,
  type EventTeamInvitation,
  type PendingTeamEventInvite,
} from '@/lib/teams';
import { FieldOpinionsSheet } from '@/components/field-opinions-sheet';
import { InviteSeekersSheet } from '@/components/invite-seekers-sheet';
import { TeamAvatar } from '@/components/team-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { categoryLabel, categoryMeta, subcategoryLabel } from '@/lib/event-categories';

export default function EventDetailScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { session } = useSession();
  const userId = session?.user?.id;
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = params.id;
  const { status: locationStatus, coords } = useWatchingLocation();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [teamInvites, setTeamInvites] = useState<EventTeamInvitation[]>([]);
  const [myTeamInvite, setMyTeamInvite] = useState<PendingTeamEventInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sygnaturowa animacja zameldowania (patrz components/check-in-ripple.tsx) —
  // czysto wizualne, jednorazowe pulsowanie po udanym zameldowaniu, samo się
  // wygasza. Nie wpływa na żadną logikę/dane.
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [opinionsOpen, setOpinionsOpen] = useState(false);
  const [inviteSeekersOpen, setInviteSeekersOpen] = useState(false);
  const [ratingModalOpen, setRatingModalOpen] = useState(false);
  const prevPastEndRef = useRef<boolean | null>(null);
  const prevStatusRef = useRef<EventDetail['status'] | null>(null);
  const mountPromptCheckedRef = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!eventId) return;
    if (!silent) setLoading(true);
    setLoadError(false);
    const [{ data, error }, teamInvRes, pendingRes] = await Promise.all([
      getEventDetail(eventId),
      listEventTeamInvitations(eventId),
      listMyPendingTeamEventInvitations(),
    ]);
    setEvent(data);
    setTeamInvites(teamInvRes.data);
    setMyTeamInvite(
      pendingRes.data.find((row) => row.event_id === eventId && row.status === 'pending') ?? null,
    );
    setLoadError(Boolean(error) || !data);
    setLoading(false);
  }, [eventId]);

  const openRatingPrompt = useCallback(
    async (trigger: 'finish' | 'scheduled_end' | 'return') => {
      if (!event?.can_rate_field || event.my_field_rating || !event.is_joined) return;
      if (await wasFieldRatingPromptHandled(event.id)) return;

      const inWindow =
        trigger === 'finish' ||
        trigger === 'scheduled_end' ||
        (trigger === 'return' &&
          (event.status === 'finished' ||
            Boolean(event.ends_at && isWithinFieldRatingPromptWindow(event.ends_at))));

      if (!inWindow) return;

      await markFieldRatingPromptHandled(event.id);
      setRatingModalOpen(true);
    },
    [event],
  );

  const closeRatingPrompt = useCallback(() => {
    setRatingModalOpen(false);
  }, []);

  const handleRatingSubmitted = useCallback(() => {
    setRatingModalOpen(false);
    void load(true);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!event || event.status !== 'planned') return;
    const timer = setInterval(() => {
      void load(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [event?.id, event?.status, load]);

  useEffect(() => {
    if (!eventId) return;
    const reload = debounce(() => void load(true), 300);
    const unsubParticipants = subscribeToTable('event_participants', reload, {
      filter: `event_id=eq.${eventId}`,
    });
    const unsubEvent = subscribeToTable('events', reload, { filter: `id=eq.${eventId}` });
    return () => {
      unsubParticipants();
      unsubEvent();
    };
  }, [eventId, load]);

  useEffect(() => {
    if (!event || loading) return;

    const statusChanged =
      prevStatusRef.current != null &&
      prevStatusRef.current !== 'finished' &&
      event.status === 'finished';
    const justPassedEnd =
      prevPastEndRef.current === false && event.is_past_scheduled_end;

    prevStatusRef.current = event.status;
    prevPastEndRef.current = event.is_past_scheduled_end;

    if (!event.is_joined || event.my_field_rating || !event.can_rate_field) return;

    if (statusChanged) {
      void openRatingPrompt('finish');
      return;
    }

    if (justPassedEnd) {
      void openRatingPrompt('scheduled_end');
      return;
    }

    if (!mountPromptCheckedRef.current) {
      mountPromptCheckedRef.current = true;
      const shouldPrompt =
        event.status === 'finished' ||
        Boolean(event.ends_at && isWithinFieldRatingPromptWindow(event.ends_at));
      if (shouldPrompt) void openRatingPrompt('return');
    }
  }, [event, loading, openRatingPrompt]);

  async function handleJoin() {
    if (!event) return;
    const allowed = await requireLocationPermission({
      title: t('event.errors.joinLocationRequiredTitle'),
      message: t('event.errors.joinLocationRequiredMessage'),
      settingsLabel: t('settings.open'),
      cancelLabel: t('common.cancel'),
    });
    if (!allowed) return;

    setBusy(true);
    const result = await joinEvent(event.id);
    setBusy(false);
    if (result === 'joined' || result === 'already_joined') {
      void logInteraction({
        kind: 'join_event',
        eventId: event.id,
        category: event.category,
        subcategory: event.subcategory,
      });
      await scheduleEventReminders({
        id: event.id,
        title: event.title,
        starts_at: event.starts_at,
      });
    } else if (result === 'waitlisted' || result === 'already_waitlisted') {
      notifyError(t('event.errors.joinWaitlisted'));
    } else if (result === 'friends_only' || result === 'forbidden') {
      notifyError(t('event.errors.joinFriendsOnly'));
    } else if (result === 'full') {
      notifyError(t('event.errors.joinFull'));
    } else if (result === 'error') {
      notifyError(t('event.errors.joinFailed'));
    }
    void load(true);
  }

  async function handleLeave() {
    if (!event) return;
    if (userId && event.creator_id === userId) {
      notifyError(t('event.errors.organizerCannotLeave'));
      return;
    }
    setBusy(true);
    const result = await leaveEvent(event.id);
    setBusy(false);
    if (result === 'organizer_cannot_leave') {
      notifyError(t('event.errors.organizerCannotLeave'));
      return;
    }
    if (result === 'error') {
      notifyError(t('event.errors.leaveFailed'));
    } else {
      await cancelEventReminders(event.id);
    }
    void load(true);
  }

  async function handleLeaveWaitlist() {
    if (!event) return;
    setBusy(true);
    await leaveEventWaitlist(event.id);
    setBusy(false);
    await cancelEventReminders(event.id);
    void load(true);
  }

  function handleRemoveParticipant(userId: string, nick: string | null) {
    if (!event) return;
    confirmAction(
      t('event.removeParticipantConfirmTitle'),
      t('event.removeParticipantConfirmBody'),
      t('event.removeParticipantConfirmAction'),
      t('common.cancel'),
      () =>
        void (async () => {
          setBusy(true);
          const result = await removeEventParticipant(event.id, userId);
          setBusy(false);
          if (result !== 'removed') {
            notifyError(t('event.errors.removeParticipantFailed'));
          }
          void load(true);
        })(),
      true,
    );
  }

  function handleEdit() {
    if (!event) return;
    router.push({
      pathname: '/event/edit',
      params: { id: event.id },
    });
  }

  function handleDelete() {
    if (!event) return;
    confirmAction(
      t('event.deleteConfirmTitle'),
      t('event.deleteConfirmBody'),
      t('event.deleteConfirmAction'),
      t('common.cancel'),
      () =>
        void (async () => {
          setBusy(true);
          const { error } = await deleteEvent(event.id);
          setBusy(false);
          if (error) {
            notifyError(t('event.errors.deleteFailed'));
            return;
          }
          notifyFieldEventCountDelta(event.field_id, -1);
          goBack('/');
        })(),
      true,
    );
  }

  async function handleCheckIn() {
    if (!event) return;
    geoDiag('click: Melduj się', { eventId: event.id });
    setBusy(true);
    try {
      const locationResult = await getCheckInCoords();
      geoDiag('handleCheckIn: getCheckInCoords ->', {
        status: locationResult.status,
        lat: locationResult.coords?.[1] ?? null,
        lng: locationResult.coords?.[0] ?? null,
      });
      const freshCoords = locationResult.coords ?? coords;
      if (!freshCoords) {
        geoDiag('handleCheckIn: no freshCoords, showing error and stopping', {
          watchingHookCoords: coords ? 'present' : 'null',
        });
        setBusy(false);
        notifyError(
          (locationResult.status === 'permission_denied'
            ? Platform.OS === 'web'
              ? isIOSWebBrowser()
                ? t('location.permissionDeniedIOS')
                : t('location.permissionDeniedAndroid')
              : t('event.errors.checkInPermissionDenied')
            : locationResult.status === 'timeout'
              ? t('location.timeout')
              : Platform.OS === 'web'
                ? t('location.unavailable')
                : t('event.errors.checkInNoLocation')) +
            // TYMCZASOWE (patrz geo-diag.ts): usunąć po ustaleniu i naprawieniu
            // realnej przyczyny — pozwala userowi przesłać zrzut ekranu zamiast
            // podłączać zdalne debugowanie.
            `\n\n${getGeoDiagTrail()}`,
        );
        return;
      }

      geoDiag('handleCheckIn: calling checkInEvent with', {
        lat: freshCoords[1],
        lng: freshCoords[0],
      });
      const result = await checkInEvent(event.id, freshCoords);
      geoDiag('handleCheckIn: checkInEvent ->', { result });
      setBusy(false);

      if (result !== 'checked_in') {
        notifyError(checkInErrorMessage(result));
        return;
      }

      setJustCheckedIn(true);
      setTimeout(() => setJustCheckedIn(false), 3200);
      void load(true);
    } catch (err) {
      // TYMCZASOWE (patrz geo-diag.ts): nic w tej ścieżce nie powinno rzucać —
      // jeśli to loguje, wcześniej był tu cichy błąd pokazywany jako ogólne
      // "spróbuj ponownie" bez śladu w konsoli.
      geoDiag('handleCheckIn: UNEXPECTED THROW', { message: String(err) });
      setBusy(false);
      notifyError(t('event.errors.checkInFailed'));
    }
  }

  async function handleManualCheckIn(targetUserId: string) {
    if (!event) return;
    setBusy(true);
    const result = await manualCheckInEvent(event.id, targetUserId);
    setBusy(false);

    if (result !== 'checked_in') {
      notifyError(
        result === 'window_still_open'
          ? t('event.checkInWindowOpen')
          : t('event.errors.checkInManualFailed'),
      );
      return;
    }

    void load(true);
  }

  function handleFinish() {
    if (!event) return;
    confirmAction(
      t('event.finishConfirmTitle'),
      t('event.finishConfirmBody'),
      t('event.finishConfirmAction'),
      t('common.cancel'),
      () =>
        void (async () => {
          setBusy(true);
          const result = await finishEvent(event.id);
          setBusy(false);
          if (result !== 'finished') {
            notifyError(t('event.errors.finishFailed'));
            return;
          }
          notifyFieldEventCountDelta(event.field_id, -1);
          void load(true);
        })(),
    );
  }

  function handleStillGoingNo() {
    handleFinish();
  }

  function handleExtend(extraMinutes: number) {
    if (!event) return;
    setBusy(true);
    void extendEvent(event.id, extraMinutes).then((result) => {
      setBusy(false);
      if (result !== 'extended') {
        notifyError(t('event.errors.extendFailed'));
        return;
      }
      void load(true);
    });
  }

  function handleStillGoingYes() {
    showActionSheet({
      title: t('event.extendBy'),
      cancelLabel: t('common.cancel'),
      options: [
        { label: t('event.extend30'), onPress: () => handleExtend(30) },
        { label: t('event.extend60'), onPress: () => handleExtend(60) },
        { label: t('event.extend90'), onPress: () => handleExtend(90) },
      ],
    });
  }

  const fieldCoords: [number, number] | null =
    event?.field_lng != null && event?.field_lat != null
      ? [event.field_lng, event.field_lat]
      : null;

  const distanceToField =
    fieldCoords && coords ? distanceMeters(coords, fieldCoords) : null;

  const isWithinCheckInRadius =
    distanceToField != null && distanceToField <= CHECK_IN_RADIUS_M;

  const canSelfCheckIn =
    event?.is_joined &&
    event.check_in_window === 'open' &&
    !event.my_check_in;

  const canManualCheckIn =
    event?.can_manage && event.check_in_window === 'closed';

  const checkInWindowHint =
    event?.check_in_window === 'not_yet'
      ? t('event.checkInWindowNotYet')
      : event?.check_in_window === 'closed'
        ? t('event.checkInWindowClosed')
        : canSelfCheckIn && distanceToField != null && !isWithinCheckInRadius
          ? t('event.checkInTooFarWaiting')
          : canSelfCheckIn && isWithinCheckInRadius
            ? t('event.checkInInRange')
            : t('event.checkInWindowOpen');

  const isFull =
    event != null &&
    event.status === 'planned' &&
    event.max_players != null &&
    event.participant_count >= event.max_players &&
    !event.is_joined &&
    !event.is_waitlisted;

  const canJoinWaitlist = isFull && event?.max_players != null;

  const showStillGoingPrompt =
    event?.can_manage &&
    event.status === 'planned' &&
    event.is_past_scheduled_end;

  const showManageActions = event?.can_manage && event.status === 'planned';

  const playersText = event
    ? formatPlayersCount(event.participant_count, event.max_players)
    : '';

  const isExtended = !!event && !event.field_id;
  const gallery: string[] = event
    ? event.image_urls.length > 0
      ? event.image_urls
      : event.image_url
        ? [event.image_url]
        : []
    : [];
  const galleryWidth = Math.max(0, windowWidth - 48);
  const meta = event ? categoryMeta(event.category) : null;
  const catLabel = event ? categoryLabel(event.category) : null;
  const subLabel = event ? subcategoryLabel(event.subcategory) : null;
  const priceText = event
    ? event.payment_status !== 'paid'
      ? t('createEvent.free')
      : event.price_cents != null
        ? `${event.price_cents % 100 === 0 ? (event.price_cents / 100).toFixed(0) : (event.price_cents / 100).toFixed(2)} zł`
        : t('eventFilters.paymentPaid')
    : '';

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 60, paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 },
      ]}>
      <Text style={styles.title}>{t('event.detailTitle')}</Text>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError || !event ? (
        <Text style={styles.errorText}>{t('event.loadError')}</Text>
      ) : (
        <View style={styles.body}>
          {event.is_admin_view ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>{t('event.adminBadge')}</Text>
              <Text style={styles.adminHint}>{t('event.adminHint')}</Text>
            </View>
          ) : null}

          {gallery.length === 1 ? (
            <Image source={{ uri: gallery[0] }} style={styles.headerImage} resizeMode="cover" />
          ) : gallery.length > 1 ? (
            <View style={styles.galleryWrap}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}>
                {gallery.map((uri, i) => (
                  <Image
                    key={`${uri}-${i}`}
                    source={{ uri }}
                    style={[styles.galleryImage, { width: galleryWidth }]}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
              <View style={styles.galleryCount}>
                <Text style={styles.galleryCountText}>📷 {gallery.length}</Text>
              </View>
            </View>
          ) : null}

          {meta ? (
            <View style={styles.categoryRow}>
              <View style={[styles.categoryBadge, { backgroundColor: meta.color }]}>
                <Text style={styles.categoryBadgeText}>
                  {meta.emoji} {catLabel}
                </Text>
              </View>
              {subLabel ? (
                <View style={[styles.subBadge, { borderColor: meta.color }]}>
                  <Text style={[styles.subBadgeText, { color: meta.color }]}>{subLabel}</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.eventTitle}>
            {event.title?.trim() || formatEventDateTime(event.starts_at)}
          </Text>

          {!isExtended ? <EventMetaBadges event={event} /> : null}

          {event.has_blocked_co_player ? (
            <EventBlockedCoPlayerBanner blockedCoPlayers={event.blocked_co_players} />
          ) : null}

          {event.visibility === 'friends_only' ? (
            <View style={styles.friendsOnlyBadge}>
              <Text style={styles.friendsOnlyBadgeText}>{t('event.friendsOnlyBadge')}</Text>
            </View>
          ) : null}

          {event.status === 'finished' ? (
            <View style={styles.finishedBadge}>
              <Text style={styles.finishedBadgeText}>{t('event.statusFinished')}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            {isExtended ? (
              event.location_name ? (
                <DetailRow label={t('event.locationLabel')} value={event.location_name} />
              ) : null
            ) : (
              <DetailRow label={t('event.atCourt')} value={formatCourtName(event.field_name)} />
            )}
            <DetailRow label={t('event.dateLabel')} value={formatEventDateTime(event.starts_at)} />
            <DetailRow
              label={t('event.durationLabel')}
              value={`${event.duration_min} ${t('event.durationShort')}`}
            />
            {event.ends_at ? (
              <DetailRow
                label={t('event.endsAtLabel')}
                value={formatEventDateTime(event.ends_at)}
              />
            ) : null}
            {!isExtended ? (
              <DetailRow label={t('field.sportLabel')} value={formatFieldSport(event.sport)} />
            ) : null}
            <DetailRow
              label={t('event.organizer')}
              value={
                (isExtended ? event.organizer_name : null) ?? event.creator_nick ?? '—'
              }
            />
            <DetailRow label={t('event.players')} value={playersText} />
            {isExtended ? <DetailRow label={t('event.priceLabel')} value={priceText} /> : null}
            {!isExtended ? (
              <Pressable
                onPress={() => setOpinionsOpen(true)}
                style={({ pressed }) => [styles.opinionsLink, pressed && styles.pressed]}>
                <Text style={styles.opinionsLinkText}>{t('fieldRatings.viewOpinions')}</Text>
              </Pressable>
            ) : null}
          </View>

          {isExtended && (event.organizer_contact || event.organizer_url) ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Organizator</Text>
              {event.organizer_name ? (
                <Text style={styles.organizerName}>{event.organizer_name}</Text>
              ) : null}
              {event.organizer_contact ? (
                <Text style={styles.organizerMeta}>{event.organizer_contact}</Text>
              ) : null}
              {event.organizer_url ? (
                <Pressable onPress={() => Linking.openURL(normalizeUrl(event.organizer_url!))}>
                  <Text style={styles.organizerLink}>{event.organizer_url}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>{t('event.descriptionTitle')}</Text>
          <View style={styles.descriptionBox}>
            <Text style={styles.descriptionText}>
              {event.description_long?.trim() ||
                event.notes?.trim() ||
                t('event.descriptionEmpty')}
            </Text>
          </View>

          {!isExtended ? (
            <>
          <Text style={styles.sectionTitle}>{t('event.checkInTitle')}</Text>
          <View style={styles.checkInCard}>
            <Text
              style={[
                styles.checkInHint,
                canSelfCheckIn &&
                  distanceToField != null &&
                  !isWithinCheckInRadius &&
                  styles.checkInHintWarning,
              ]}>
              {checkInWindowHint}
            </Text>

            {event.field_lng != null && event.field_lat != null ? (
              <View style={styles.checkInDistanceRow}>
                {distanceToField != null ? (
                  <Text style={styles.checkInDistance}>
                    {t('event.checkInDistance')}: {formatDistance(distanceToField)}
                  </Text>
                ) : locationStatus === 'denied' ? (
                  <Text style={styles.muted}>{t('event.errors.checkInNoLocation')}</Text>
                ) : (
                  <Text style={styles.muted}>{t('event.checkInLocating')}</Text>
                )}
                <NavigateToFieldButton
                  destination={{
                    lat: event.field_lat,
                    lng: event.field_lng,
                    name: event.field_name,
                    fieldId: event.field_id,
                  }}
                  userCoords={coords}
                />
              </View>
            ) : locationStatus === 'denied' ? (
              <Text style={styles.muted}>{t('event.errors.checkInNoLocation')}</Text>
            ) : null}

            {event.my_check_in ? (
              <View style={styles.checkInStatusRow}>
                <View style={styles.checkInRippleAnchor}>
                  <CheckInRipple active={justCheckedIn} size={64} />
                </View>
                <Text style={styles.checkInDone}>{t('event.checkInDone')}</Text>
                {event.my_check_in.is_late ? (
                  <Text style={styles.checkInLateBadge}>{t('event.checkInLate')}</Text>
                ) : null}
              </View>
            ) : canSelfCheckIn && isWithinCheckInRadius ? (
              <Button
                label={busy ? t('event.checkInChecking') : t('event.checkInButton')}
                onPress={handleCheckIn}
                disabled={busy}
              />
            ) : null}
          </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>{t('event.participantsTitle')}</Text>
          {event.participants.length === 0 ? (
            <Text style={styles.muted}>{t('event.participantsEmpty')}</Text>
          ) : (
            <View style={styles.participantsList}>
              {event.participants.map((p) => {
                const isCheckedIn = Boolean(p.checked_in_at);
                const showManual =
                  canManualCheckIn && !isCheckedIn && p.user_id !== userId;
                const showRemove =
                  event.can_manage &&
                  p.user_id !== event.creator_id &&
                  p.user_id !== userId;

                return (
                  <Animated.View
                    key={p.user_id}
                    entering={FadeIn.duration(220)}
                    exiting={FadeOut.duration(160)}
                    layout={LinearTransition.springify().damping(24).stiffness(220)}
                    style={styles.participantRow}>
                    <Pressable
                      style={({ pressed }) => [styles.participantMain, pressed && styles.pressed]}
                      onPress={() =>
                        p.user_id === userId
                          ? router.push('/profile')
                          : router.push({ pathname: '/user/[id]', params: { id: p.user_id } })
                      }>
                      <UserAvatar
                        nick={p.is_blocked_by_me && p.user_id !== userId ? null : p.nick}
                        avatarUrl={p.avatar_url}
                        size={36}
                      />
                      <View style={styles.participantMainText}>
                        <Text style={styles.participantName}>
                          {p.is_blocked_by_me && p.user_id !== userId
                            ? t('event.blockedParticipantNick')
                            : (p.nick ?? t('event.you'))}
                          {p.user_id === userId ? ` (${t('event.you')})` : ''}
                        </Text>
                        <Text
                          style={[
                            styles.participantStatus,
                            isCheckedIn ? styles.participantPresent : styles.participantAbsent,
                          ]}>
                          {isCheckedIn
                            ? p.check_in_method === 'manual'
                              ? t('event.checkInManualDone')
                              : t('event.checkInParticipantPresent')
                            : t('event.checkInParticipantAbsent')}
                          {p.is_late ? ` · ${t('event.checkInLate')}` : ''}
                        </Text>
                      </View>
                    </Pressable>
                    <View style={styles.participantActions}>
                      {showManual ? (
                        <Pressable
                          onPress={() => handleManualCheckIn(p.user_id)}
                          disabled={busy}
                          style={styles.manualCheckInBtn}>
                          <Text style={styles.manualCheckInText}>{t('event.checkInManual')}</Text>
                        </Pressable>
                      ) : null}
                      {showRemove ? (
                        <Pressable
                          onPress={() => handleRemoveParticipant(p.user_id, p.nick)}
                          disabled={busy}
                          style={styles.removeParticipantBtn}>
                          <Text style={styles.removeParticipantText}>
                            {t('event.removeParticipant')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )}

          {event.can_manage && event.waitlist.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>{t('event.waitlistTitle')}</Text>
              <View style={styles.participantsList}>
                {event.waitlist.map((w) => (
                  <View key={w.user_id} style={styles.participantRow}>
                    <Text style={styles.participantName}>
                      {w.is_blocked_by_me
                        ? t('event.blockedParticipantNick')
                        : (w.nick ?? '—')}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {showStillGoingPrompt ? (
            <View style={styles.stillGoingCard}>
              <Text style={styles.stillGoingTitle}>{t('event.stillGoingTitle')}</Text>
              <Text style={styles.stillGoingBody}>{t('event.stillGoingBody')}</Text>
              <View style={styles.stillGoingActions}>
                <Button
                  label={t('event.stillGoingYes')}
                  onPress={handleStillGoingYes}
                  disabled={busy}
                />
                <Button
                  label={t('event.stillGoingNo')}
                  variant="secondary"
                  onPress={handleStillGoingNo}
                  disabled={busy}
                />
              </View>
            </View>
          ) : null}

          {myTeamInvite ? (
            <View style={styles.teamInviteCard}>
              <Text style={styles.teamInviteTitle}>{t('teams.eventInvitePending')}</Text>
              <Text style={styles.teamInviteMeta}>{myTeamInvite.team_name}</Text>
              <View style={styles.teamInviteActions}>
                <Button
                  label={t('teams.eventInviteAccept')}
                  onPress={async () => {
                    setBusy(true);
                    await respondTeamEventInvitation(myTeamInvite.invitation_id, true);
                    setBusy(false);
                    void load(true);
                  }}
                  disabled={busy}
                />
                <Button
                  label={t('teams.eventInviteDecline')}
                  variant="secondary"
                  onPress={async () => {
                    setBusy(true);
                    await respondTeamEventInvitation(myTeamInvite.invitation_id, false);
                    setBusy(false);
                    void load(true);
                  }}
                  disabled={busy}
                />
              </View>
            </View>
          ) : null}

          {event.can_manage && teamInvites.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>{t('teams.eventInviteTitle')}</Text>
              {teamInvites.map((inv) => (
                <View key={inv.invitation_id} style={styles.teamInviteRow}>
                  <TeamAvatar name={inv.team_name} logoUrl={inv.team_logo_url} size={40} />
                  <View style={styles.teamInviteRowMain}>
                    <Text style={styles.teamInviteName}>{inv.team_name}</Text>
                    <Text style={styles.teamInviteStats}>
                      {t('teams.eventInviteStats')
                        .replace('{accepted}', String(inv.accepted_count))
                        .replace('{total}', String(inv.member_count))}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            {event.status === 'planned' ? (
              event.is_joined ? (
                <Button
                  label={t('event.leave')}
                  variant="secondary"
                  onPress={handleLeave}
                  disabled={busy}
                />
              ) : event.is_waitlisted ? (
                <Button
                  label={t('event.leaveWaitlist')}
                  variant="secondary"
                  onPress={handleLeaveWaitlist}
                  disabled={busy}
                />
              ) : canJoinWaitlist ? (
                <Button
                  label={t('event.joinWaitlist')}
                  onPress={handleJoin}
                  disabled={busy}
                />
              ) : isFull ? (
                <Button label={t('event.full')} disabled />
              ) : (
                <Button label={t('event.join')} onPress={handleJoin} disabled={busy} />
              )
            ) : null}

            {event.status === 'planned' && (event.is_joined || event.can_manage) ? (
              <Button
                label={t('teams.shareEvent')}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: '/event/[id]/share-team',
                    params: { id: event.id },
                  })
                }
                disabled={busy}
              />
            ) : null}

            {showManageActions ? (
              <>
                <Button
                  label={t('playNow.inviteSeekersAction')}
                  variant="secondary"
                  onPress={() => setInviteSeekersOpen(true)}
                  disabled={busy}
                />
                <Button
                  label={t('teams.eventInviteAction')}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/event/[id]/invite-team',
                      params: { id: event.id },
                    })
                  }
                  disabled={busy}
                />
                <Button
                  label={t('event.finishEvent')}
                  onPress={handleFinish}
                  disabled={busy}
                />
                <Button
                  label={t('event.edit')}
                  variant="secondary"
                  onPress={handleEdit}
                  disabled={busy}
                />
                <Button
                  label={t('event.delete')}
                  variant="secondary"
                  onPress={handleDelete}
                  disabled={busy}
                  style={styles.deleteBtn}
                />
              </>
            ) : null}
          </View>
        </View>
      )}

      <FieldOpinionsSheet
        fieldId={event?.field_id ?? null}
        visible={opinionsOpen}
        onClose={() => setOpinionsOpen(false)}
      />

      <InviteSeekersSheet
        eventId={event?.id ?? null}
        visible={inviteSeekersOpen}
        onClose={() => setInviteSeekersOpen(false)}
      />

      {event ? (
        <FieldRatingPromptModal
          visible={ratingModalOpen}
          eventId={event.id}
          fieldName={event.field_name}
          eventTitle={event.title}
          initialRating={event.my_field_rating}
          onClose={closeRatingPrompt}
          onSubmitted={handleRatingSubmitted}
        />
      ) : null}
    </ScrollView>
  );
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    backgroundColor: Brand.screenBackground,
  },
  title: {
    ...Typography.screenTitle,
    marginTop: 8,
    marginBottom: 16,
  },
  loader: {
    marginTop: 40,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
  },
  body: {
    gap: 16,
  },
  adminBadge: {
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: Brand.primary,
    borderRadius: 12,
    padding: 12,
  },
  adminBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  adminHint: {
    fontSize: 13,
    color: Brand.textSecondary,
    marginTop: 4,
  },
  eventTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Brand.textPrimary,
    flexShrink: 1,
  },
  headerImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: Brand.surfaceMuted,
  },
  galleryWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: Brand.surfaceMuted,
  },
  galleryImage: {
    aspectRatio: 16 / 9,
  },
  galleryCount: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  galleryCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  subBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  subBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  organizerMeta: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 2,
  },
  organizerLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.primary,
    marginTop: 4,
  },
  finishedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#eef0f2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  finishedBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stillGoingCard: {
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: Brand.primary,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  stillGoingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  stillGoingBody: {
    fontSize: 14,
    color: Brand.textSecondary,
    lineHeight: 20,
  },
  stillGoingActions: {
    gap: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 16,
    color: Brand.textPrimary,
  },
  opinionsLink: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  opinionsLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  descriptionBox: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    padding: 14,
  },
  teamInviteCard: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.primary,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  teamInviteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  teamInviteMeta: {
    fontSize: 14,
    color: Brand.textMuted,
  },
  teamInviteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  teamInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  teamInviteRowMain: {
    flex: 1,
    gap: 2,
  },
  teamInviteName: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  teamInviteStats: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  deleteBtn: {
    borderColor: Brand.danger,
  },
  descriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: Brand.textPrimary,
  },
  muted: {
    fontSize: 14,
    color: Brand.textMuted,
  },
  participantsList: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  participantMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  participantMainText: {
    flex: 1,
    gap: 2,
  },
  participantActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  participantName: {
    fontSize: 15,
    color: Brand.textPrimary,
  },
  participantStatus: {
    fontSize: 12,
  },
  participantPresent: {
    color: Brand.success,
  },
  participantAbsent: {
    color: Brand.textMuted,
  },
  manualCheckInBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Brand.primaryLight,
    borderWidth: 1,
    borderColor: Brand.primary,
  },
  manualCheckInText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.primary,
  },
  removeParticipantBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Brand.dangerLight,
    borderWidth: 1,
    borderColor: Brand.danger,
  },
  removeParticipantText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.danger,
  },
  friendsOnlyBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Brand.infoLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: Brand.info,
  },
  friendsOnlyBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.info,
  },
  checkInCard: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  checkInHint: {
    fontSize: 14,
    color: Brand.textSecondary,
    lineHeight: 20,
  },
  checkInHintWarning: {
    color: Brand.warning,
    fontWeight: '600',
  },
  checkInDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  checkInDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  checkInStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkInRippleAnchor: {
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  checkInDone: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.success,
  },
  checkInLateBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.warning,
    backgroundColor: Brand.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  actions: {
    gap: 12,
    marginTop: 8,
  },
});
// eventy: obsługa wydarzeń rozszerzonych (kategorie, zdjęcie, organizator)
