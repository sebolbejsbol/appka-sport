import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import { markerEmoji, subcategoryLabel } from '@/lib/event-categories';
import {
  listMyEventInvitations,
  respondEventInvitation,
  type EventInvitation,
} from '@/lib/events';

const POLL_INTERVAL_MS = 30000;

export function EventInvitePromptHost() {
  const { session } = useSession();
  const pathname = usePathname();
  const [invite, setInvite] = useState<EventInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const checkingRef = useRef(false);
  const dismissedRef = useRef<Set<string>>(new Set());

  const checkForInvite = useCallback(async () => {
    if (!session?.user?.id || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const { data } = await listMyEventInvitations();
      const next = data.find((inv) => !dismissedRef.current.has(inv.invitation_id));
      if (!next) return;
      if (pathname === `/event/${next.event_id}`) return;
      setInvite((prev) => prev ?? next);
    } finally {
      checkingRef.current = false;
    }
  }, [pathname, session?.user?.id]);

  useEffect(() => {
    void checkForInvite();
  }, [checkForInvite]);

  useEffect(() => {
    const id = setInterval(() => void checkForInvite(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [checkForInvite]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void checkForInvite();
    });
    return () => sub.remove();
  }, [checkForInvite]);

  async function respond(accept: boolean) {
    if (!invite || busy) return;
    setBusy(true);
    await respondEventInvitation(invite.invitation_id, accept);
    dismissedRef.current.add(invite.invitation_id);
    setBusy(false);
    setInvite(null);
    setTimeout(() => void checkForInvite(), 400);
  }

  function openDetails() {
    if (!invite) return;
    dismissedRef.current.add(invite.invitation_id);
    const id = invite.event_id;
    setInvite(null);
    router.push(`/event/${id}`);
  }

  if (!invite) return null;

  const label = subcategoryLabel(invite.subcategory ?? invite.sport) || t('playNow.title');
  const spots =
    invite.max_players != null
      ? `${invite.participant_count}/${invite.max_players}`
      : `${invite.participant_count}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void respond(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <UserAvatar nick={invite.from_nick} avatarUrl={invite.from_avatar_url} size={48} />
            <View style={styles.headerText}>
              <Text style={styles.title}>{t('playNow.incomingTitle')}</Text>
              <Text style={styles.body}>
                {t('playNow.incomingBody').replace('{nick}', invite.from_nick?.trim() || '?')}
              </Text>
            </View>
          </View>

          <View style={styles.eventCard}>
            <Text style={styles.eventEmoji}>{markerEmoji('sport', invite.subcategory ?? invite.sport)}</Text>
            <View style={styles.eventMain}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {invite.event_title?.trim() || label}
              </Text>
              <Text style={styles.eventMeta} numberOfLines={1}>
                {formatEventDateTime(invite.starts_at)}
              </Text>
              <Text style={styles.eventMeta} numberOfLines={1}>
                📍 {invite.location_name?.trim() || label} · 👥 {spots}
              </Text>
            </View>
          </View>

          <Pressable onPress={openDetails} style={({ pressed }) => [styles.detailsBtn, pressed && styles.pressed]}>
            <Text style={styles.detailsText}>{t('playNow.details')} ›</Text>
          </Pressable>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={() => void respond(false)}
              disabled={busy}
              style={({ pressed }) => [styles.declineBtn, pressed && styles.pressed]}>
              <Text style={styles.declineText}>{t('playNow.decline')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void respond(true)}
              disabled={busy}
              style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed, busy && styles.disabled]}>
              <Text style={styles.acceptText}>{busy ? '…' : t('playNow.accept')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: Brand.screenBackground,
    borderRadius: 22,
    padding: 20,
    ...shadow('lg'),
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '900', color: Brand.textPrimary },
  body: { fontSize: 14, color: Brand.textSecondary },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  eventEmoji: { fontSize: 28 },
  eventMain: { flex: 1, minWidth: 0, gap: 2 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary },
  eventMeta: { fontSize: 13, color: Brand.textMuted },
  detailsBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 6 },
  detailsText: { fontSize: 14, fontWeight: '700', color: Brand.primary },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  declineBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.pill,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  declineText: { color: Brand.textSecondary, fontWeight: '700', fontSize: 15 },
  acceptBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.pill,
    alignItems: 'center',
    backgroundColor: Brand.success,
  },
  acceptText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
});
