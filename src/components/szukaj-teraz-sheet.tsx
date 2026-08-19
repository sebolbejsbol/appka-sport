import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import type { LngLat } from '@/hooks/use-user-location';
import { t } from '@/i18n';
import { formatTime } from '@/lib/datetime';
import {
  categoryEmoji,
  categoryLabel,
  markerEmoji,
  subcategoriesFor,
  subcategoryLabel,
  type EventCategory,
} from '@/lib/event-categories';
import { getInvitableEvents, inviteUserToEvent, type InvitableEvent } from '@/lib/events';
import { formatDistance } from '@/lib/geo';
import {
  getMyPlayStatus,
  joinPlayQueue,
  leavePlayQueue,
  listPlaySeekers,
  type PlayNowSkill,
  type PlaySeeker,
} from '@/lib/play-now';

function skillOptions(): { id: PlayNowSkill | null; label: string }[] {
  return [
    { id: null, label: t('eventFilters.skillAll') },
    { id: 'beginner', label: t('eventFilters.skillBeginner') },
    { id: 'intermediate', label: t('eventFilters.skillIntermediate') },
    { id: 'advanced', label: t('eventFilters.skillAdvanced') },
  ];
}

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
  userCoords: LngLat | null;
  onClose: () => void;
  onCreate: () => void;
};

/** Kolejka szukania jest teraz tylko dla Sportu — inne kategorie (hobby, kultura, ...) usunięte na życzenie. */
const category: EventCategory = 'sport';

export function SzukajTerazSheet({ visible, userCoords, onClose, onCreate }: Props) {
  const insets = useSafeAreaInsets();

  const [inQueue, setInQueue] = useState(false);
  const [joinStep, setJoinStep] = useState<1 | 2 | 3>(1);
  const [sport, setSport] = useState<string | null>(null);
  const [skill, setSkill] = useState<PlayNowSkill | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [seekers, setSeekers] = useState<PlaySeeker[]>([]);
  const [loadingSeekers, setLoadingSeekers] = useState(false);
  const [invitedIds, setInvitedIds] = useState<string[]>([]);

  const [inviteTarget, setInviteTarget] = useState<PlaySeeker | null>(null);
  const [invitableEvents, setInvitableEvents] = useState<InvitableEvent[] | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<string | null>(null);

  const loadSeekers = useCallback(
    async (filterCategory: string | null, filterSport: string | null) => {
      setLoadingSeekers(true);
      const { data } = await listPlaySeekers({
        coords: userCoords,
        category: filterCategory,
        sport: filterSport,
      });
      setSeekers(data);
      setLoadingSeekers(false);
    },
    [userCoords],
  );

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void getMyPlayStatus().then((status) => {
      if (!active) return;
      if (status === 'looking') {
        setInQueue(true);
        void loadSeekers(null, null);
      } else {
        setInQueue(false);
        setJoinStep(1);
      }
    });
    return () => {
      active = false;
    };
  }, [visible, loadSeekers]);

  function goBack() {
    setJoinStep((s) => {
      if (s === 3) return 2;
      if (s === 2) return 1;
      return s;
    });
  }

  async function handleJoin() {
    setBusy(true);
    const { ok } = await joinPlayQueue({
      category,
      sport,
      skill,
      coords: userCoords,
      note: note.trim() || null,
    });
    setBusy(false);
    if (ok) {
      setInQueue(true);
      void loadSeekers(category, sport);
    }
  }

  async function handleLeave() {
    setBusy(true);
    await leavePlayQueue();
    setBusy(false);
    setInQueue(false);
    setJoinStep(1);
    setSeekers([]);
  }

  async function openInvite(seeker: PlaySeeker) {
    setInviteTarget(seeker);
    setInvitableEvents(null);
    const events = await getInvitableEvents(seeker.user_id);
    setInvitableEvents(events);
  }

  async function handleInviteToEvent(event: InvitableEvent) {
    if (!inviteTarget) return;
    setInviteBusyId(event.event_id);
    const result = await inviteUserToEvent(event.event_id, inviteTarget.user_id);
    setInviteBusyId(null);
    if (result === 'sent' || result === 'already_invited') {
      setInvitedIds((prev) => [...prev, inviteTarget.user_id]);
      setInviteTarget(null);
      setInvitableEvents(null);
    }
  }

  function close() {
    setInviteTarget(null);
    setInvitableEvents(null);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>🔎 {t('playNow.title')}</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.headerSubtitle}>{t('playNow.pickSubtitle')}</Text>

          {!inQueue ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <View style={styles.progressTrack}>
                {[1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[styles.progressSeg, i <= joinStep && styles.progressSegActive]}
                  />
                ))}
              </View>
              <Text style={styles.stepCounter}>
                {t('playNow.stepOf').replace('{current}', String(joinStep)).replace('{total}', '3')}
              </Text>

              {joinStep === 1 ? (
                <>
                  <Text style={styles.stepTitle}>{t('playNow.step2Title')}</Text>
                  <Text style={styles.subtitle}>{t('playNow.step2Subtitle')}</Text>
                  <View style={styles.chipsWrap}>
                    <Chip
                      label={t('playNow.anySubcategory')}
                      active={sport === null}
                      onPress={() => {
                        setSport(null);
                        setJoinStep(2);
                      }}
                    />
                    {subcategoriesFor(category).map((s) => (
                      <Chip
                        key={s.id}
                        label={`${markerEmoji(category, s.id)} ${s.label}`}
                        active={sport === s.id}
                        onPress={() => {
                          setSport(s.id);
                          setJoinStep(2);
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {joinStep === 2 ? (
                <>
                  <Text style={styles.stepTitle}>{t('playNow.step3Title')}</Text>
                  <Text style={styles.subtitle}>{t('playNow.step3Subtitle')}</Text>
                  <View style={styles.chipsWrap}>
                    {skillOptions().map((opt) => (
                      <Chip
                        key={opt.id ?? 'any'}
                        label={opt.label}
                        active={skill === opt.id}
                        onPress={() => {
                          setSkill(opt.id);
                          setJoinStep(3);
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {joinStep === 3 ? (
                <>
                  <Text style={styles.stepTitle}>{t('playNow.step4Title')}</Text>
                  <Text style={styles.subtitle}>{t('playNow.step4Subtitle')}</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryChip}>
                      {sport ? `${markerEmoji(category, sport)} ${subcategoryLabel(sport)}` : `${categoryEmoji(category)} ${categoryLabel(category)}`}
                    </Text>
                  </View>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('playNow.notePlaceholder')}
                    placeholderTextColor={Brand.textMuted}
                    style={styles.noteInput}
                    maxLength={120}
                  />
                  <Pressable
                    onPress={() => void handleJoin()}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.searchBtn,
                      pressed && styles.pressed,
                      busy && styles.disabled,
                    ]}>
                    <Text style={styles.searchBtnText}>
                      {busy ? t('common.loading') : `🟢 ${t('playNow.joinQueue')}`}
                    </Text>
                  </Pressable>
                  {!userCoords ? <Text style={styles.note}>{t('playNow.noLocation')}</Text> : null}
                </>
              ) : null}

              {joinStep > 1 ? (
                <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>‹ {t('playNow.back')}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : (
            <>
              <View style={styles.queueBar}>
                <View style={styles.queueDot} />
                <Text style={styles.queueText}>{t('playNow.inQueue')}</Text>
                <Pressable onPress={() => void handleLeave()} disabled={busy} hitSlop={8}>
                  <Text style={styles.leaveText}>{t('playNow.leaveQueue')}</Text>
                </Pressable>
              </View>

              <View style={styles.listHeaderRow}>
                <Text style={styles.listHeader}>{t('playNow.seekersTitle')}</Text>
                <Pressable onPress={() => void loadSeekers(category, sport)} hitSlop={8}>
                  <Text style={styles.refresh}>↻</Text>
                </Pressable>
              </View>

              {loadingSeekers ? (
                <ActivityIndicator color={Brand.primary} style={styles.loader} />
              ) : seekers.length === 0 ? (
                <Text style={styles.note}>{t('playNow.seekersEmpty')}</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
                  {seekers.map((seeker) => (
                    <SeekerRow
                      key={seeker.user_id}
                      seeker={seeker}
                      invited={invitedIds.includes(seeker.user_id)}
                      onInvite={() => void openInvite(seeker)}
                    />
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </View>

      {/* Wybór eventu, do którego zapraszamy poszukiwacza */}
      <Modal
        visible={inviteTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteTarget(null)}>
        <View style={styles.pickerBackdrop}>
          <Pressable style={styles.backdropFill} onPress={() => setInviteTarget(null)} />
          <View style={[styles.pickerCard, { marginBottom: insets.bottom + 16 }]}>
            <Text style={styles.pickerTitle}>
              {t('playNow.inviteTitle').replace('{nick}', inviteTarget?.nick?.trim() || '?')}
            </Text>

            {invitableEvents === null ? (
              <ActivityIndicator color={Brand.primary} style={styles.loader} />
            ) : invitableEvents.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.note}>{t('playNow.noInvitable')}</Text>
                <Pressable
                  onPress={() => {
                    setInviteTarget(null);
                    close();
                    onCreate();
                  }}
                  style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}>
                  <Text style={styles.createBtnText}>➕ {t('playNow.createEvent')}</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView style={styles.pickerList}>
                {invitableEvents.map((ev) => {
                  const label = subcategoryLabel(ev.subcategory ?? ev.sport) || t('playNow.title');
                  const spots =
                    ev.max_players != null
                      ? `${ev.participant_count}/${ev.max_players}`
                      : `${ev.participant_count}`;
                  return (
                    <Pressable
                      key={ev.event_id}
                      onPress={() => void handleInviteToEvent(ev)}
                      disabled={inviteBusyId === ev.event_id}
                      style={({ pressed }) => [styles.pickerRow, pressed && styles.pressed]}>
                      <Text style={styles.rowEmoji}>{markerEmoji('sport', ev.subcategory ?? ev.sport)}</Text>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {ev.title?.trim() || label}
                        </Text>
                        <Text style={styles.rowMeta2} numberOfLines={1}>
                          {formatTime(ev.starts_at)} · {ev.location_name?.trim() || label} · 👥 {spots}
                        </Text>
                      </View>
                      <Text style={styles.invitePlus}>{inviteBusyId === ev.event_id ? '…' : '＋'}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable onPress={() => setInviteTarget(null)} style={styles.pickerCancel}>
              <Text style={styles.pickerCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

function SeekerRow({
  seeker,
  invited,
  onInvite,
}: {
  seeker: PlaySeeker;
  invited: boolean;
  onInvite: () => void;
}) {
  const sportText = seeker.sport ? subcategoryLabel(seeker.sport) : categoryLabel(seeker.category);
  const skill = skillLabel(seeker.skill);
  const metaParts = [sportText, skill, seeker.distance_m != null ? formatDistance(seeker.distance_m) : null].filter(
    Boolean,
  );

  return (
    <View style={styles.row}>
      <UserAvatar nick={seeker.nick} avatarUrl={seeker.avatar_url} size={44} showOnline isOnline={seeker.is_online} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {seeker.nick?.trim() || '—'}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {markerEmoji(seeker.category, seeker.sport)}{' '}
          {metaParts.join(' · ')}
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
        <Pressable onPress={onInvite} style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}>
          <Text style={styles.joinBtnText}>{t('playNow.invite')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '88%',
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
  title: { fontSize: 22, fontWeight: '800', color: Brand.textPrimary },
  close: { fontSize: 18, color: Brand.textMuted, padding: 4 },
  headerSubtitle: { fontSize: 13, color: Brand.textMuted, marginTop: 4 },
  subtitle: { fontSize: 14, color: Brand.textMuted, marginTop: 2, marginBottom: 8 },
  body: { paddingBottom: 24 },
  progressTrack: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 8 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Brand.border },
  progressSegActive: { backgroundColor: Brand.primary },
  stepCounter: { fontSize: 12, fontWeight: '700', color: Brand.textMuted, marginBottom: 4 },
  stepTitle: { fontSize: 19, fontWeight: '800', color: Brand.textPrimary, marginTop: 6 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
  summaryChip: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
    backgroundColor: Brand.surfaceMuted,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  backBtn: { alignSelf: 'flex-start', marginTop: 18, paddingVertical: 8, paddingHorizontal: 4 },
  backBtnText: { fontSize: 15, fontWeight: '700', color: Brand.textSecondary },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
    marginTop: 14,
    marginBottom: 8,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Brand.textSecondary },
  chipTextActive: { color: Brand.primaryText },
  noteInput: {
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: Brand.textPrimary,
  },
  searchBtn: {
    marginTop: 20,
    backgroundColor: Brand.success,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    ...shadow('sm'),
  },
  disabled: { opacity: 0.6 },
  searchBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  note: { marginTop: 12, fontSize: 13, color: Brand.textMuted, textAlign: 'center' },
  loader: { marginTop: 24 },
  queueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  queueDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.success },
  queueText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#166534' },
  leaveText: { fontSize: 13, fontWeight: '700', color: Brand.danger },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  listHeader: { fontSize: 13, fontWeight: '800', color: Brand.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  refresh: { fontSize: 20, color: Brand.primary },
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
  rowEmoji: { fontSize: 24 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  rowMeta: { fontSize: 13, color: Brand.textSecondary },
  rowNote: { fontSize: 12, color: Brand.textMuted, fontStyle: 'italic' },
  rowMeta2: { fontSize: 12, color: Brand.textMuted },
  joinBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  joinBtnText: { color: Brand.primaryText, fontWeight: '800', fontSize: 13 },
  invitedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: '#dcfce7',
  },
  invitedText: { color: '#166534', fontWeight: '700', fontSize: 12 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  pickerCard: {
    backgroundColor: Brand.screenBackground,
    borderRadius: 20,
    padding: 18,
    maxHeight: '70%',
  },
  pickerTitle: { fontSize: 17, fontWeight: '800', color: Brand.textPrimary, marginBottom: 12 },
  pickerEmpty: { alignItems: 'center', gap: 14, paddingVertical: 12 },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    marginBottom: 8,
  },
  invitePlus: { fontSize: 22, fontWeight: '800', color: Brand.primary, paddingHorizontal: 4 },
  createBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  createBtnText: { color: Brand.primaryText, fontWeight: '800', fontSize: 14 },
  pickerCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  pickerCancelText: { color: Brand.textMuted, fontWeight: '700', fontSize: 14 },
  pressed: { opacity: 0.85 },
});
