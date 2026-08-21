import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { categoryLabel, markerEmoji, subcategoryLabel } from '@/lib/event-categories';
import {
  inviteUserToEvent,
  listEventInviteSeekers,
  type EventInviteSeeker,
} from '@/lib/events';
import { formatDistance } from '@/lib/geo';

function skillLabel(skill: string | null): string | null {
  switch (skill) {
    case 'beginner':
      return t('eventFilters.skillBeginner');
    case 'intermediate':
      return t('eventFilters.skillIntermediate');
    case 'advanced':
      return t('eventFilters.skillAdvanced');
    default:
      return null;
  }
}

type Props = {
  visible: boolean;
  eventId: string | null;
  onClose: () => void;
};

export function InviteSeekersSheet({ visible, eventId, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [seekers, setSeekers] = useState<EventInviteSeeker[]>([]);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    const { data } = await listEventInviteSeekers(eventId);
    setSeekers(data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    setInvitedIds([]);
    void load();
  }, [visible, load]);

  async function handleInvite(seeker: EventInviteSeeker) {
    if (!eventId) return;
    setBusyId(seeker.user_id);
    const result = await inviteUserToEvent(eventId, seeker.user_id);
    setBusyId(null);
    if (result === 'sent' || result === 'already_invited' || result === 'already_member') {
      setInvitedIds((prev) => [...prev, seeker.user_id]);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>🔎 {t('playNow.seekersMatchTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{t('playNow.seekersMatchSubtitle')}</Text>

          <View style={styles.listHeaderRow}>
            <Text style={styles.listHeader}>{t('playNow.seekersTitle')}</Text>
            <Pressable onPress={() => void load()} hitSlop={8}>
              <Text style={styles.refresh}>↻</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={Brand.primary} style={styles.loader} />
          ) : seekers.length === 0 ? (
            <Text style={styles.note}>{t('playNow.seekersMatchEmpty')}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              {seekers.map((seeker) => (
                <SeekerRow
                  key={seeker.user_id}
                  seeker={seeker}
                  invited={invitedIds.includes(seeker.user_id)}
                  busy={busyId === seeker.user_id}
                  onInvite={() => void handleInvite(seeker)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SeekerRow({
  seeker,
  invited,
  busy,
  onInvite,
}: {
  seeker: EventInviteSeeker;
  invited: boolean;
  busy: boolean;
  onInvite: () => void;
}) {
  const sportText = seeker.sport ? subcategoryLabel(seeker.sport) : categoryLabel(seeker.category);
  const skill = skillLabel(seeker.skill);
  const metaParts = [
    sportText,
    skill,
    seeker.distance_m != null ? formatDistance(seeker.distance_m) : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <UserAvatar
        nick={seeker.nick}
        avatarUrl={seeker.avatar_url}
        size={44}
        showOnline
        isOnline={seeker.is_online}
      />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {seeker.nick?.trim() || '—'}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {markerEmoji(seeker.category, seeker.sport)} {metaParts.join(' · ')}
        </Text>
        {seeker.note?.trim() ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            „{seeker.note.trim()}"
          </Text>
        ) : null}
      </View>
      {invited ? (
        <View style={styles.invitedBadge}>
          <Text style={styles.invitedText}>{t('playNow.invited')}</Text>
        </View>
      ) : (
        <Pressable
          onPress={onInvite}
          disabled={busy}
          style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed, busy && styles.disabled]}>
          <Text style={styles.joinBtnText}>{busy ? '…' : t('playNow.invite')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: Brand.screenBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.border,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: BrandFonts.bodyBold, fontSize: 20, fontWeight: '800', color: Brand.textPrimary },
  close: { fontSize: 18, color: Brand.textMuted, padding: 4 },
  subtitle: { fontFamily: BrandFonts.body, fontSize: 14, color: Brand.textMuted, marginTop: 2 },
  body: { paddingBottom: 24 },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  listHeader: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '800',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  refresh: { fontSize: 20, color: Brand.primary },
  loader: { marginTop: 24 },
  note: { fontFamily: BrandFonts.body, marginTop: 18, fontSize: 13, color: Brand.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    marginBottom: 10,
    ...shadow('sm'),
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: BrandFonts.bodyBold, fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  rowMeta: { fontFamily: BrandFonts.body, fontSize: 13, color: Brand.textSecondary },
  rowNote: { fontFamily: BrandFonts.body, fontSize: 12, color: Brand.textMuted, fontStyle: 'italic' },
  joinBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  joinBtnText: { fontFamily: BrandFonts.bodyBold, color: Brand.primaryText, fontWeight: '800', fontSize: 13 },
  invitedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: '#dcfce7',
  },
  invitedText: { fontFamily: BrandFonts.bodyBold, color: '#166534', fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
});
