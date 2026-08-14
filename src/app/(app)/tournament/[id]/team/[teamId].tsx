import { useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { FriendInviteList } from '@/components/friend-invite-list';
import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { getTeamDetail, listTeamInvitationsForTeam, type TeamDetail, type TeamInvitationRow } from '@/lib/teams';
import {
  getMyTeamRegistrationStatus,
  registerTeamForTournament,
  withdrawTeamRegistration,
  type TournamentTeamStatus,
} from '@/lib/tournament-teams';
import { getTournamentDetail, type Tournament } from '@/lib/tournaments';

export default function TournamentTeamRosterScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; teamId?: string }>();
  const tournamentId = params.id;
  const teamId = params.teamId;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [status, setStatus] = useState<TournamentTeamStatus>('none');
  const [invites, setInvites] = useState<TeamInvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId || !teamId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      const [{ data: tournamentData }, { data: teamData }, teamStatus, invitesResult] = await Promise.all([
        getTournamentDetail(tournamentId),
        getTeamDetail(teamId),
        getMyTeamRegistrationStatus(tournamentId, teamId),
        listTeamInvitationsForTeam(teamId),
      ]);
      setTournament(tournamentData);
      setTeam(teamData);
      setStatus(teamStatus);
      setInvites(invitesResult.data);
      setNotFound(!tournamentData || !teamData);
    } catch (err) {
      console.error('[TournamentTeamRosterScreen] load failed', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, teamId]);

  const onInviteSent = useCallback(() => {
    void load();
  }, [load]);

  async function handleSubmitRegistration() {
    if (!tournamentId || !teamId) return;
    setBusy(true);
    setActionError(null);
    const result = await registerTeamForTournament(tournamentId, teamId);
    setBusy(false);
    if (result !== 'ok') {
      setActionError(
        result === 'team_too_small'
          ? t('tournamentTeams.teamTooSmallError')
          : result === 'tournament_full'
            ? t('tournamentTeamRoster.tournamentFullError')
            : t('tournamentTeams.registerError'),
      );
      return;
    }
    void load();
  }

  function confirmWithdraw() {
    confirmAction(
      t('tournamentTeams.withdrawConfirmTitle'),
      t('tournamentTeams.withdrawConfirmMessage'),
      t('tournamentTeams.withdrawAction'),
      t('common.cancel'),
      () => void handleWithdraw(),
      true,
    );
  }

  async function handleWithdraw() {
    if (!tournamentId || !teamId) return;
    setBusy(true);
    setActionError(null);
    const result = await withdrawTeamRegistration(tournamentId, teamId);
    setBusy(false);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.withdrawError'));
      return;
    }
    void load();
  }

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} onBack={() => goBack(`/tournament/${tournamentId ?? ''}` as Href)} />
        <Text style={styles.muted}>{t('tournamentTeamRoster.loadError')}</Text>
        <Button label={t('common.retry')} onPress={() => void load()} style={styles.retryBtn} />
      </View>
    );
  }

  if (notFound || !tournament || !team || !tournamentId) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} onBack={() => goBack('/' as Href)} />
        <Text style={styles.muted}>{t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  const required = tournament.players_per_team;
  const rosterReady = team.member_count >= required;
  const canSubmit = status === 'none' || status === 'rejected' || status === 'withdrawn';
  const memberIds = team.members.map((m) => m.user_id);
  const pendingInviteIds = invites.filter((i) => i.status === 'pending').map((i) => i.user_id);
  const excludeIds = [...memberIds, ...pendingInviteIds];

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={team.name}
        onBack={() => goBack(`/tournament/${tournamentId}` as Href)}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.progressCard}>
          <Text style={styles.progressCount}>
            {t('tournamentTeamRoster.progressLabel')
              .replace('{count}', String(team.member_count))
              .replace('{required}', String(required))}
          </Text>
          <View style={[styles.statusPill, rosterReady ? styles.statusPillFull : styles.statusPillIncomplete]}>
            <Text style={[styles.statusPillText, rosterReady ? styles.statusPillTextFull : styles.statusPillTextIncomplete]}>
              {rosterReady ? t('tournamentTeamRoster.statusFull') : t('tournamentTeamRoster.statusIncomplete')}
            </Text>
          </View>
        </View>

        {status === 'pending' || status === 'approved' ? (
          <Text style={styles.registrationStatus}>
            {status === 'approved' ? t('tournamentTeams.statusApproved') : t('tournamentTeams.statusPending')}
          </Text>
        ) : null}

        <Text style={styles.sectionHeading}>{t('tournamentTeamRoster.membersTitle')}</Text>
        <View style={styles.card}>
          {team.members.map((m, idx) => (
            <View key={m.user_id} style={[styles.memberRow, idx > 0 && styles.rowDivider]}>
              <UserAvatar nick={m.nick} avatarUrl={m.avatar_url} size={40} />
              <Text style={styles.memberName} numberOfLines={1}>
                {m.nick?.trim() || t('common.nick')}
              </Text>
              {m.role === 'owner' ? (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>★</Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        {invites.filter((i) => i.status !== 'accepted').length > 0 ? (
          <>
            <Text style={styles.sectionHeading}>{t('tournamentTeamRoster.invitesTitle')}</Text>
            <View style={styles.card}>
              {invites
                .filter((i) => i.status !== 'accepted')
                .map((inv, idx) => (
                  <View key={inv.invitation_id} style={[styles.memberRow, idx > 0 && styles.rowDivider]}>
                    <UserAvatar nick={inv.nick} avatarUrl={inv.avatar_url} size={40} />
                    <Text style={styles.memberName} numberOfLines={1}>
                      {inv.nick?.trim() || t('common.nick')}
                    </Text>
                    <Text
                      style={[
                        styles.inviteStatus,
                        inv.status === 'rejected' && styles.inviteStatusRejected,
                      ]}>
                      {inv.status === 'rejected'
                        ? t('tournamentTeams.rosterMemberRejected')
                        : t('tournamentTeams.rosterMemberPending')}
                    </Text>
                  </View>
                ))}
            </View>
          </>
        ) : null}

        {team.can_manage && canSubmit ? (
          <>
            {showInvite ? (
              <>
                <Text style={styles.sectionHeading}>{t('tournamentTeamRoster.inviteFriendsTitle')}</Text>
                <FriendInviteList teamId={team.team_id} excludeUserIds={excludeIds} onInvited={onInviteSent} scrollEnabled={false} />
              </>
            ) : (
              <Button
                label={t('tournamentTeamRoster.inviteFriendsCta')}
                variant="secondary"
                onPress={() => setShowInvite(true)}
                style={styles.actionBtn}
              />
            )}
          </>
        ) : null}

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

        {team.can_manage ? (
          status === 'pending' || status === 'approved' ? (
            <Button
              label={t('tournamentTeams.withdrawAction')}
              variant="secondary"
              onPress={confirmWithdraw}
              disabled={busy}
              style={styles.actionBtn}
            />
          ) : canSubmit && rosterReady ? (
            <Button
              label={t('tournamentTeamRoster.submitAction')}
              onPress={() => void handleSubmitRegistration()}
              disabled={busy}
              style={styles.actionBtn}
            />
          ) : null
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  retryBtn: { marginHorizontal: 20, marginTop: 16 },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 4 },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  progressCount: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillFull: { backgroundColor: Brand.primaryLight },
  statusPillIncomplete: { backgroundColor: Brand.surfaceMuted },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  statusPillTextFull: { color: Brand.primary },
  statusPillTextIncomplete: { color: Brand.textMuted },
  registrationStatus: { fontSize: 14, color: Brand.primary, fontWeight: '600', marginBottom: 16 },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 10, marginTop: 8 },
  card: {
    borderRadius: Radius.lg,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Brand.border },
  memberName: { flex: 1, fontSize: 15, color: Brand.textPrimary, fontWeight: '600' },
  ownerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerBadgeText: { color: Brand.primary, fontSize: 12, fontWeight: '800' },
  inviteStatus: { fontSize: 12, fontWeight: '700', color: Brand.textMuted },
  inviteStatusRejected: { color: Brand.danger },
  actionBtn: { marginTop: 16 },
  errorText: { fontSize: 13, color: Brand.danger, marginTop: 12 },
});
