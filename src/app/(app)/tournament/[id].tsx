import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { formatTeamSport } from '@/lib/sports';
import { listMyTeams, type TeamListItem } from '@/lib/teams';
import {
  getMyTeamRegistrationStatus,
  listTournamentTeamRegistrations,
  registerTeamForTournament,
  withdrawTeamRegistration,
  type TournamentTeamRegistration,
  type TournamentTeamStatus,
} from '@/lib/tournament-teams';
import {
  getTournamentStandings,
  listTournamentMatches,
  type TournamentMatch,
  type TournamentStanding,
} from '@/lib/tournament-matches';
import { getTournamentDetail, type Tournament, type TournamentStatus } from '@/lib/tournaments';

function groupById<T extends { group_id: string; group_name: string }>(
  items: T[],
): { group_id: string; group_name: string; items: T[] }[] {
  const order: string[] = [];
  const map: Record<string, { group_id: string; group_name: string; items: T[] }> = {};
  for (const item of items) {
    if (!map[item.group_id]) {
      map[item.group_id] = { group_id: item.group_id, group_name: item.group_name, items: [] };
      order.push(item.group_id);
    }
    map[item.group_id].items.push(item);
  }
  return order.map((id) => map[id]);
}

function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [registrations, setRegistrations] = useState<TournamentTeamRegistration[]>([]);
  const [myTeams, setMyTeams] = useState<TeamListItem[]>([]);
  const [myStatuses, setMyStatuses] = useState<Record<string, TournamentTeamStatus>>({});
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const [{ data }, regsResult, teamsResult, matchesResult, standingsResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentTeamRegistrations(tournamentId, false),
      listMyTeams(),
      listTournamentMatches(tournamentId),
      getTournamentStandings(tournamentId),
    ]);
    setTournament(data);
    setNotFound(!data);
    setRegistrations(regsResult.data);
    setMatches(matchesResult.data);
    setStandings(standingsResult.data);
    setLoadError(Boolean(regsResult.error || teamsResult.error || matchesResult.error || standingsResult.error));

    if (data) {
      const eligible = teamsResult.data.filter(
        (team) =>
          (team.my_role === 'owner' || team.my_role === 'admin') && team.sport === data.sport,
      );
      setMyTeams(eligible);
      const statuses = await Promise.all(
        eligible.map((team) => getMyTeamRegistrationStatus(tournamentId, team.team_id)),
      );
      const map: Record<string, TournamentTeamStatus> = {};
      eligible.forEach((team, i) => {
        map[team.team_id] = statuses[i];
      });
      setMyStatuses(map);
      setSelectedTeamId((prev) => prev ?? eligible.find((t) => map[t.team_id] === 'none')?.team_id ?? null);
    } else {
      setMyTeams([]);
      setMyStatuses({});
    }

    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRegister() {
    if (!tournamentId || !selectedTeamId) return;
    setRegBusy(true);
    setRegError(null);
    const result = await registerTeamForTournament(tournamentId, selectedTeamId);
    setRegBusy(false);
    if (result !== 'ok') {
      setRegError(t('tournamentTeams.registerError'));
      return;
    }
    void load();
  }

  function confirmWithdraw(teamId: string) {
    confirmAction(
      t('tournamentTeams.withdrawConfirmTitle'),
      t('tournamentTeams.withdrawConfirmMessage'),
      t('tournamentTeams.withdrawAction'),
      t('common.cancel'),
      () => void handleWithdraw(teamId),
      true,
    );
  }

  async function handleWithdraw(teamId: string) {
    if (!tournamentId) return;
    setRegBusy(true);
    setRegError(null);
    const result = await withdrawTeamRegistration(tournamentId, teamId);
    setRegBusy(false);
    if (result !== 'ok') {
      setRegError(t('tournamentTeams.withdrawError'));
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

  if (notFound || !tournament) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} onBack={() => goBack('/' as Href)} />
        <Text style={styles.muted}>{t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader insetTop={insets.top} title={tournament.name} onBack={() => goBack('/' as Href)} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headerRow}>
          {tournament.logo_url ? <Image source={{ uri: tournament.logo_url }} style={styles.logo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.sportBadge}>{formatTeamSport(tournament.sport)}</Text>
            <Text style={styles.statusBadge}>{statusLabel(tournament.status)}</Text>
          </View>
        </View>

        {tournament.description ? <Text style={styles.description}>{tournament.description}</Text> : null}

        <View style={styles.infoBlock}>
          <Text style={styles.infoLine}>
            {tournament.event_date} · {tournament.start_time.slice(0, 5)}
            {tournament.end_time ? `–${tournament.end_time.slice(0, 5)}` : ''}
          </Text>
          {tournament.location_name ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.locationLabel')}: {tournament.location_name}</Text>
          ) : null}
          {tournament.address ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.addressLabel')}: {tournament.address}</Text>
          ) : null}
          {tournament.city ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.cityLabel')}: {tournament.city}</Text>
          ) : null}
          {tournament.contact_info ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.contactLabel')}: {tournament.contact_info}</Text>
          ) : null}
          {tournament.registration_opens_at ? (
            <Text style={styles.infoLine}>
              {t('tournamentDetail.registrationOpensLabel')}: {new Date(tournament.registration_opens_at).toLocaleString()}
            </Text>
          ) : null}
          <Text style={styles.infoLine}>
            {t('tournamentDetail.registrationClosesLabel')}: {new Date(tournament.registration_closes_at).toLocaleString()}
          </Text>
          <Text style={styles.infoLine}>
            {registrations.length} / {tournament.max_teams} {t('tournamentDetail.teamsRegistered')}
          </Text>
        </View>

        {myTeams.length > 0 && tournament.status === 'registration_open' ? (
          <View style={styles.registerBlock}>
            <Text style={styles.sectionHeading}>{t('tournamentTeams.registerSectionTitle')}</Text>
            {(() => {
              const unregistered = myTeams.filter((team) => {
                const s = myStatuses[team.team_id];
                return s === 'none' || s === 'rejected' || s === 'withdrawn';
              });
              const registeredTeam = myTeams.find((team) => {
                const s = myStatuses[team.team_id];
                return s === 'pending' || s === 'approved';
              });

              if (registeredTeam) {
                const s = myStatuses[registeredTeam.team_id];
                return (
                  <View style={styles.myRegRow}>
                    <Text style={styles.myRegText}>
                      {registeredTeam.name} — {s === 'approved' ? t('tournamentTeams.statusApproved') : t('tournamentTeams.statusPending')}
                    </Text>
                    <Button
                      label={t('tournamentTeams.withdrawAction')}
                      variant="secondary"
                      onPress={() => confirmWithdraw(registeredTeam.team_id)}
                      disabled={regBusy}
                    />
                  </View>
                );
              }

              if (unregistered.length === 0) return null;

              return (
                <>
                  <Text style={styles.pickHint}>{t('tournamentTeams.pickTeamHint')}</Text>
                  <View style={styles.teamChipsRow}>
                    {unregistered.map((team) => (
                      <Pressable
                        key={team.team_id}
                        onPress={() => setSelectedTeamId(team.team_id)}
                        style={[styles.teamChip, selectedTeamId === team.team_id && styles.teamChipActive]}>
                        <Text
                          style={[
                            styles.teamChipText,
                            selectedTeamId === team.team_id && styles.teamChipTextActive,
                          ]}>
                          {team.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label={t('tournamentTeams.registerAction')}
                    onPress={handleRegister}
                    disabled={regBusy || !selectedTeamId}
                    style={styles.registerBtn}
                  />
                </>
              );
            })()}
            {regError ? <Text style={styles.regErrorText}>{regError}</Text> : null}
          </View>
        ) : null}

        <View style={styles.teamsBlock}>
          <Text style={styles.sectionHeading}>{t('tournamentTeams.sectionTitle')}</Text>
          {loadError ? <Text style={styles.regErrorText}>{t('tournamentTeams.loadError')}</Text> : null}
          {registrations.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentTeams.empty')}</Text>
          ) : (
            registrations.map((reg) => (
              <View key={reg.id} style={styles.teamRow}>
                {reg.team_logo_url ? (
                  <Image source={{ uri: reg.team_logo_url }} style={styles.teamLogo} />
                ) : (
                  <View style={styles.teamLogoFallback} />
                )}
                <Text style={styles.teamRowName}>{reg.team_name}</Text>
                {reg.group_name ? <Text style={styles.teamRowGroup}>{reg.group_name}</Text> : null}
              </View>
            ))
          )}
        </View>

        {standings.length > 0 || matches.length > 0 ? (
          <View style={styles.groupsBlock}>
            {groupById(standings).map((group) => {
              const groupMatches = matches.filter((m) => m.group_id === group.group_id);
              return (
                <View key={group.group_id} style={styles.groupSection}>
                  <Text style={styles.sectionHeading}>
                    {group.group_name} · {t('tournamentMatches.standingsTitle')}
                  </Text>
                  <View style={styles.standingsHeaderRow}>
                    <Text style={[styles.standingsCell, styles.standingsCellTeam, styles.standingsHeaderText]}>
                      {t('tournamentMatches.colTeam')}
                    </Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colPlayed')}</Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colWins')}</Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colDraws')}</Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colLosses')}</Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colDiff')}</Text>
                    <Text style={[styles.standingsCell, styles.standingsHeaderText]}>{t('tournamentMatches.colPoints')}</Text>
                  </View>
                  {group.items.map((row) => (
                    <View key={row.team_id} style={styles.standingsRow}>
                      <Text style={[styles.standingsCell, styles.standingsCellTeam]} numberOfLines={1}>
                        {row.rank}. {row.team_name}
                      </Text>
                      <Text style={styles.standingsCell}>{row.played}</Text>
                      <Text style={styles.standingsCell}>{row.wins}</Text>
                      <Text style={styles.standingsCell}>{row.draws}</Text>
                      <Text style={styles.standingsCell}>{row.losses}</Text>
                      <Text style={styles.standingsCell}>{row.point_diff}</Text>
                      <Text style={styles.standingsCell}>{row.points}</Text>
                    </View>
                  ))}

                  <Text style={[styles.sectionHeading, styles.fixturesHeading]}>{t('tournamentMatches.fixturesTitle')}</Text>
                  {groupMatches.length === 0 ? (
                    <Text style={styles.emptyText}>{t('tournamentMatches.noMatchesYet')}</Text>
                  ) : (
                    groupMatches.map((m) => (
                      <View key={m.id} style={styles.matchRow}>
                        <Text style={styles.matchTeamText} numberOfLines={1}>{m.team_a_name}</Text>
                        <Text style={styles.matchScoreText}>
                          {m.status === 'completed' ? `${m.score_a} – ${m.score_b}` : t('tournamentMatches.vsLabel')}
                        </Text>
                        <Text style={[styles.matchTeamText, styles.matchTeamTextRight]} numberOfLines={1}>{m.team_b_name}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 64, height: 64, borderRadius: Radius.md, backgroundColor: Brand.surface },
  headerText: { gap: 6 },
  sportBadge: { fontSize: 13, fontWeight: '600', color: Brand.textSecondary },
  statusBadge: { fontSize: 13, fontWeight: '700', color: Brand.primary },
  description: { fontSize: 14, color: Brand.textPrimary, marginBottom: 16, lineHeight: 20 },
  infoBlock: { gap: 8 },
  infoLine: { fontSize: 14, color: Brand.textSecondary },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 10 },
  registerBlock: { marginTop: 24 },
  pickHint: { fontSize: 13, color: Brand.textMuted, marginBottom: 8 },
  teamChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  teamChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  teamChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  teamChipText: { fontSize: 13, fontWeight: '600', color: Brand.textPrimary },
  teamChipTextActive: { color: Brand.primaryText },
  registerBtn: { marginTop: 4 },
  myRegRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  myRegText: { flex: 1, fontSize: 14, color: Brand.textPrimary },
  regErrorText: { fontSize: 13, color: Brand.danger, marginTop: 8 },
  teamsBlock: { marginTop: 24 },
  emptyText: { fontSize: 14, color: Brand.textMuted },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  teamLogo: { width: 32, height: 32, borderRadius: 8, backgroundColor: Brand.surface },
  teamLogoFallback: { width: 32, height: 32, borderRadius: 8, backgroundColor: Brand.surfaceMuted },
  teamRowName: { flex: 1, fontSize: 14, color: Brand.textPrimary, fontWeight: '600' },
  teamRowGroup: { fontSize: 12, color: Brand.textMuted },
  groupsBlock: { marginTop: 24 },
  groupSection: { marginBottom: 24 },
  standingsHeaderRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Brand.border },
  standingsRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Brand.border },
  standingsCell: { flex: 1, fontSize: 13, color: Brand.textPrimary, textAlign: 'center' },
  standingsCellTeam: { flex: 3, textAlign: 'left' },
  standingsHeaderText: { fontWeight: '700', color: Brand.textSecondary, fontSize: 12 },
  fixturesHeading: { marginTop: 16 },
  matchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  matchTeamText: { flex: 1, fontSize: 13, color: Brand.textPrimary },
  matchTeamTextRight: { textAlign: 'right' },
  matchScoreText: { fontSize: 13, fontWeight: '700', color: Brand.textSecondary, minWidth: 48, textAlign: 'center' },
});
