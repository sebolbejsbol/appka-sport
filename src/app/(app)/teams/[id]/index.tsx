import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { TeamAvatar } from '@/components/team-avatar';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useSession } from '@/context/session';
import { getLocale, t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { formatTeamSport } from '@/lib/sports';
import {
  getTeamDetail,
  listTeamJoinRequests,
  removeTeamMember,
  respondTeamJoinRequest,
  setTeamMemberRole,
  type TeamDetail,
  type TeamJoinRequest,
  type TeamMember,
} from '@/lib/teams';

const MONTHS_PL = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatFounded(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = getLocale() === 'en' ? MONTHS_EN : MONTHS_PL;
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function roleLabel(role: TeamMember['role']): string {
  switch (role) {
    case 'owner':
      return t('teams.roleOwner');
    case 'admin':
      return t('teams.roleAdmin');
    default:
      return t('teams.roleMember');
  }
}

const ROLE_RANK: Record<TeamMember['role'], number> = { owner: 0, admin: 1, member: 2 };

export default function TeamDetailScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myUserId = session?.user?.id;
  const params = useLocalSearchParams<{ id?: string }>();
  const teamId = params.id;

  useEffect(() => {
    if (teamId === 'new' || teamId === 'create') {
      router.replace('/teams/create' as Href);
    }
  }, [teamId]);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [requests, setRequests] = useState<TeamJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    // 'new'/'create' to aliasy ekranu tworzenia — nie pobieramy ich jako drużyny.
    if (teamId === 'new' || teamId === 'create') return;
    setLoading(true);
    setError(false);
    const { data, error: loadErr } = await getTeamDetail(teamId);
    setTeam(data);
    setError(Boolean(loadErr) || !data);
    if (data?.can_manage) {
      const reqRes = await listTeamJoinRequests(teamId);
      setRequests(reqRes.data);
    } else {
      setRequests([]);
    }
    setLoading(false);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRespondRequest(requestId: string, accept: boolean) {
    if (!teamId || busy) return;
    setBusy(true);
    await respondTeamJoinRequest(requestId, accept);
    setBusy(false);
    void load();
  }

  async function handleRemoveMember(userId: string) {
    if (!teamId || busy) return;
    setBusy(true);
    await removeTeamMember(teamId, userId);
    setBusy(false);
    void load();
  }

  async function handleSetRole(member: TeamMember, role: 'admin' | 'member') {
    if (!teamId || busy) return;
    setBusy(true);
    await setTeamMemberRole(teamId, member.user_id, role);
    setBusy(false);
    void load();
  }

  function openMemberMenu(member: TeamMember) {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    // Zmiana ról tylko dla właściciela; admin może jedynie usuwać zwykłych członków.
    if (team?.is_owner) {
      if (member.role === 'member') {
        buttons.push({ text: t('teams.makeAdmin'), onPress: () => void handleSetRole(member, 'admin') });
      } else if (member.role === 'admin') {
        buttons.push({ text: t('teams.makeMember'), onPress: () => void handleSetRole(member, 'member') });
      }
    }
    buttons.push({
      text: t('teams.removeMember'),
      style: 'destructive',
      onPress: () =>
        Alert.alert(member.nick?.trim() || t('common.nick'), t('teams.removeMember'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('teams.removeMember'),
            style: 'destructive',
            onPress: () => void handleRemoveMember(member.user_id),
          },
        ]),
    });
    buttons.push({ text: t('common.cancel'), style: 'cancel' });
    Alert.alert(member.nick?.trim() || t('common.nick'), t('teams.manageMember'), buttons);
  }

  function confirmLeave() {
    if (!myUserId) return;
    Alert.alert(t('teams.leaveTeam'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('teams.leaveTeam'),
        style: 'destructive',
        onPress: () => void handleRemoveMember(myUserId),
      },
    ]);
  }

  if (!teamId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('teams.loadError')}</Text>
      </View>
    );
  }

  const onlineCount = team?.members.filter((m) => m.is_online).length ?? 0;
  const sortedMembers = team
    ? [...team.members].sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role])
    : [];

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={team?.name ?? t('teams.detailTitle')}
        onBack={() => goBack('/teams' as Href)}
        rightActions={
          team?.can_manage
            ? [
                {
                  key: 'settings',
                  icon: '⚙',
                  accessibilityLabel: t('teams.settings'),
                  onPress: () =>
                    router.push({ pathname: '/teams/[id]/settings', params: { id: teamId } }),
                },
              ]
            : undefined
        }
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : error || !team ? (
        <Text style={styles.error}>{t('teams.loadError')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {/* Karta nagłówkowa */}
          <View style={styles.heroCard}>
            <TeamAvatar name={team.name} logoUrl={team.logo_url} size={96} />
            <Text style={styles.name}>{team.name}</Text>
            <View style={styles.heroPills}>
              <View style={styles.sportPill}>
                <Text style={styles.sportPillText}>{formatTeamSport(team.sport)}</Text>
              </View>
              {team.created_at ? (
                <Text style={styles.founded}>
                  {t('teams.founded').replace('{date}', formatFounded(team.created_at))}
                </Text>
              ) : null}
            </View>
            {team.description ? <Text style={styles.description}>{team.description}</Text> : null}
          </View>

          {/* Szybkie akcje */}
          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push({ pathname: '/teams/[id]/chat', params: { id: teamId } })}
              style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && styles.pressed]}>
              <Text style={styles.actionPrimaryText}>💬 {t('teams.openChat')}</Text>
            </Pressable>
            {team.can_manage ? (
              <Pressable
                onPress={() => router.push({ pathname: '/teams/[id]/invite', params: { id: teamId } })}
                style={({ pressed }) => [styles.actionBtn, styles.actionSecondary, pressed && styles.pressed]}>
                <Text style={styles.actionSecondaryText}>＋ {t('teams.invite')}</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Pasek statystyk */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{team.member_count}</Text>
              <Text style={styles.statLabel}>{t('teams.statMembers')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, onlineCount > 0 && styles.statValueOnline]}>
                {onlineCount}
              </Text>
              <Text style={styles.statLabel}>{t('teams.statOnline')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValueSmall}>{roleLabel(team.my_role)}</Text>
              <Text style={styles.statLabel}>{t('teams.statRole')}</Text>
            </View>
          </View>

          {/* Prośby o dołączenie */}
          {team.can_manage && requests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('teams.joinRequests')} · {requests.length}
              </Text>
              <View style={styles.card}>
                {requests.map((req, idx) => (
                  <View
                    key={req.request_id}
                    style={[styles.requestRow, idx > 0 && styles.rowDivider]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/user/[id]', params: { id: req.user_id } })}
                      style={styles.memberMain}>
                      <UserAvatar nick={req.nick} avatarUrl={req.avatar_url} size={44} />
                      <Text style={styles.memberName}>{req.nick?.trim() || t('common.nick')}</Text>
                    </Pressable>
                    <View style={styles.requestActions}>
                      <Pressable
                        disabled={busy}
                        onPress={() => void handleRespondRequest(req.request_id, true)}
                        style={({ pressed }) => [styles.approveBtn, pressed && styles.pressed]}>
                        <Text style={styles.approveText}>{t('teams.approveRequest')}</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => void handleRespondRequest(req.request_id, false)}
                        hitSlop={6}>
                        <Text style={styles.dangerLink}>{t('teams.rejectRequest')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Skład */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {t('teams.members')} · {team.member_count}
            </Text>
            <View style={styles.card}>
              {sortedMembers.map((member, idx) => {
                const isSelf = member.user_id === myUserId;
                // Właściciel zarządza adminami i członkami; admin tylko zwykłymi członkami.
                const canManageMember =
                  team.can_manage &&
                  !isSelf &&
                  member.role !== 'owner' &&
                  (team.is_owner || member.role === 'member');
                return (
                  <View key={member.user_id} style={[styles.memberRow, idx > 0 && styles.rowDivider]}>
                    <Pressable
                      onPress={() => router.push({ pathname: '/user/[id]', params: { id: member.user_id } })}
                      style={styles.memberMain}>
                      <UserAvatar
                        nick={member.nick}
                        avatarUrl={member.avatar_url}
                        size={44}
                        showOnline
                        isOnline={member.is_online}
                      />
                      <View style={styles.memberText}>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.nick?.trim() || t('common.nick')}
                          {isSelf ? ' (Ty)' : ''}
                        </Text>
                        <Text style={styles.memberRole}>{roleLabel(member.role)}</Text>
                      </View>
                    </Pressable>
                    {member.role === 'owner' ? (
                      <View style={styles.ownerBadge}>
                        <Text style={styles.ownerBadgeText}>★</Text>
                      </View>
                    ) : canManageMember ? (
                      <Pressable
                        onPress={() => openMemberMenu(member)}
                        hitSlop={10}
                        style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
                        <Text style={styles.menuIcon}>⋯</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>

          {!team.is_owner && myUserId ? (
            <Pressable onPress={confirmLeave} style={styles.leaveBtn}>
              <Text style={styles.dangerLink}>{t('teams.leaveTeam')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loader: { marginTop: 32 },
  error: { color: Brand.danger, textAlign: 'center', marginTop: 24 },
  muted: { color: Brand.textMuted },

  heroCard: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  name: { fontSize: 24, fontWeight: '800', color: Brand.textPrimary, textAlign: 'center' },
  heroPills: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sportPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primaryLight,
  },
  sportPillText: { color: Brand.primary, fontSize: 13, fontWeight: '700' },
  founded: { fontSize: 13, color: Brand.textMuted },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
    marginTop: 2,
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: Brand.primary, ...shadow('sm') },
  actionPrimaryText: { color: Brand.primaryText, fontWeight: '800', fontSize: 15 },
  actionSecondary: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  actionSecondaryText: { color: Brand.textPrimary, fontWeight: '700', fontSize: 15 },

  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: Brand.textPrimary },
  statValueOnline: { color: Brand.success },
  statValueSmall: { fontSize: 14, fontWeight: '800', color: Brand.textPrimary, textAlign: 'center' },
  statLabel: {
    fontSize: 11,
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '700',
  },

  section: { paddingHorizontal: 20, paddingTop: 22 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  card: {
    borderRadius: Radius.lg,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.border,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 },
  memberText: { flex: 1, gap: 2, minWidth: 0 },
  memberName: { fontSize: 16, fontWeight: '600', color: Brand.textPrimary },
  memberRole: { fontSize: 13, color: Brand.textMuted },
  ownerBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerBadgeText: { color: Brand.primary, fontSize: 14, fontWeight: '800' },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceMuted,
  },
  menuIcon: { fontSize: 20, color: Brand.textSecondary, fontWeight: '800', marginTop: -6 },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  approveBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  approveText: { color: Brand.primaryText, fontSize: 13, fontWeight: '700' },
  dangerLink: { color: Brand.danger, fontSize: 13, fontWeight: '600' },
  leaveBtn: { alignItems: 'center', paddingVertical: 24 },
  pressed: { opacity: 0.85 },
});
