import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CreateTeamModal } from '@/components/create-team-modal';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { formatTeamSport } from '@/lib/sports';
import { listMyTeamsForTournament, type TeamListItem } from '@/lib/teams';
import {
  getMyTeamRegistrationStatus,
  listTournamentTeamRegistrations,
  type TournamentTeamRegistration,
  type TournamentTeamStatus,
} from '@/lib/tournament-teams';
import {
  getTournamentStandings,
  listTournamentMatches,
  type TournamentMatch,
  type TournamentStanding,
} from '@/lib/tournament-matches';
import {
  listTournamentPlayoffBracket,
  type TournamentPlayoffMatch,
} from '@/lib/tournament-playoffs';
import { getTournamentDetail, type Tournament, type TournamentStatus } from '@/lib/tournaments';

function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return t('tournamentPlayoffs.roundLabelFinal');
  if (fromEnd === 1) return t('tournamentPlayoffs.roundLabelSemifinal');
  if (fromEnd === 2) return t('tournamentPlayoffs.roundLabelQuarterfinal');
  return `${t('tournamentPlayoffs.roundLabelPrefix')} ${round}`;
}

function groupByRound(matches: TournamentPlayoffMatch[]): { round: number; items: TournamentPlayoffMatch[] }[] {
  const order: number[] = [];
  const map: Record<number, TournamentPlayoffMatch[]> = {};
  for (const m of matches) {
    if (!map[m.round]) {
      map[m.round] = [];
      order.push(m.round);
    }
    map[m.round].push(m);
  }
  return order.map((round) => ({ round, items: map[round] }));
}

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [bracket, setBracket] = useState<TournamentPlayoffMatch[]>([]);

  const load = useCallback(async () => {
    if (!tournamentId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    const [{ data }, regsResult, teamsResult, matchesResult, standingsResult, bracketResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentTeamRegistrations(tournamentId, false),
      listMyTeamsForTournament(tournamentId),
      listTournamentMatches(tournamentId),
      getTournamentStandings(tournamentId),
      listTournamentPlayoffBracket(tournamentId),
    ]);
    setTournament(data);
    setNotFound(!data);
    setRegistrations(regsResult.data);
    setMatches(matchesResult.data);
    setStandings(standingsResult.data);
    setBracket(bracketResult.data);
    setLoadError(
      Boolean(regsResult.error || teamsResult.error || matchesResult.error || standingsResult.error || bracketResult.error),
    );

    if (data) {
      const eligible = teamsResult.data.filter(
        (team) => team.my_role === 'owner' || team.my_role === 'admin',
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

  function goToTeam(teamId: string) {
    if (!tournamentId) return;
    router.push({ pathname: '/tournament/[id]/team/[teamId]', params: { id: tournamentId, teamId } });
  }

  function handleTeamCreated(teamId: string) {
    setShowCreateModal(false);
    goToTeam(teamId);
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

  const myRegisteredTeam = myTeams.find((team) => {
    const s = myStatuses[team.team_id];
    return s === 'pending' || s === 'approved';
  });
  const spotsAvailable = registrations.length < tournament.max_teams;
  // Jedna drużyna na turniej per osoba — jeśli ma już jakąkolwiek (nawet dopiero
  // budowaną, jeszcze niezgłoszoną), nie pokazujemy opcji stworzenia kolejnej.
  const canAddTeam = tournament.status === 'registration_open' && myTeams.length === 0 && spotsAvailable;

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

        {(myTeams.length > 0 || canAddTeam) && tournament.status === 'registration_open' ? (
          <View style={styles.registerBlock}>
            <Text style={styles.sectionHeading}>{t('tournamentTeams.registerSectionTitle')}</Text>
            {myTeams.map((team) => {
              const s = myStatuses[team.team_id];
              const statusText =
                s === 'approved'
                  ? t('tournamentTeams.statusApproved')
                  : s === 'pending'
                    ? t('tournamentTeams.statusPending')
                    : null;
              return (
                <Pressable key={team.team_id} onPress={() => goToTeam(team.team_id)} style={styles.teamLinkRow}>
                  <View style={styles.teamLinkText}>
                    <Text style={styles.teamLinkName}>{team.name}</Text>
                    <Text style={styles.teamLinkMeta}>
                      {t('tournamentTeamRoster.progressLabel')
                        .replace('{count}', String(team.member_count))
                        .replace('{required}', String(tournament.players_per_team))}
                      {statusText ? ` · ${statusText}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.teamLinkChevron}>{t('tournamentTeamRoster.detailsLabel')}</Text>
                </Pressable>
              );
            })}
            {canAddTeam ? (
              <Button
                label={t('tournamentTeamRoster.createTeamCta')}
                variant="secondary"
                onPress={() => setShowCreateModal(true)}
                style={styles.registerBtn}
              />
            ) : null}
          </View>
        ) : null}

        <CreateTeamModal
          visible={showCreateModal}
          sport={tournament.sport}
          tournamentId={tournamentId ?? ''}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTeamCreated}
        />

        <View style={styles.teamsBlock}>
          <Text style={styles.sectionHeading}>{t('tournamentTeams.sectionTitle')}</Text>
          {loadError ? <Text style={styles.regErrorText}>{t('tournamentTeams.loadError')}</Text> : null}
          {registrations.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentTeams.empty')}</Text>
          ) : (
            registrations.map((reg) => (
              <Pressable key={reg.id} onPress={() => goToTeam(reg.team_id)} style={styles.teamRow}>
                {reg.team_logo_url ? (
                  <Image source={{ uri: reg.team_logo_url }} style={styles.teamLogo} />
                ) : (
                  <View style={styles.teamLogoFallback} />
                )}
                <Text style={styles.teamRowName}>{reg.team_name}</Text>
                {reg.group_name ? <Text style={styles.teamRowGroup}>{reg.group_name}</Text> : null}
                <Text style={styles.teamRowChevron}>{t('tournamentTeamRoster.detailsLabel')}</Text>
              </Pressable>
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

        {bracket.length > 0 ? (
          <View style={styles.groupsBlock}>
            <Text style={styles.sectionHeading}>{t('tournamentPlayoffs.bracketTitle')}</Text>
            {(() => {
              const rounds = groupByRound(bracket);
              const totalRounds = rounds.length > 0 ? rounds[rounds.length - 1].round : 0;
              return rounds.map((r) => (
                <View key={r.round} style={styles.groupSection}>
                  <Text style={styles.fixturesHeading}>{roundLabel(r.round, totalRounds)}</Text>
                  {r.items.map((m) => (
                    <View key={m.id} style={styles.matchRow}>
                      <Text style={styles.matchTeamText} numberOfLines={1}>
                        {m.team_a_name ?? t('tournamentPlayoffs.tbdLabel')}
                      </Text>
                      <Text style={styles.matchScoreText}>
                        {m.status === 'completed' ? `${m.score_a} – ${m.score_b}` : t('tournamentMatches.vsLabel')}
                      </Text>
                      <Text style={[styles.matchTeamText, styles.matchTeamTextRight]} numberOfLines={1}>
                        {m.team_b_name ?? t('tournamentPlayoffs.tbdLabel')}
                      </Text>
                    </View>
                  ))}
                </View>
              ));
            })()}
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
  registerBtn: { marginTop: 4 },
  regErrorText: { fontSize: 13, color: Brand.danger, marginTop: 8 },
  teamLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  teamLinkText: { flex: 1, gap: 2 },
  teamLinkName: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  teamLinkMeta: { fontSize: 13, color: Brand.textSecondary },
  teamLinkChevron: { fontSize: 13, fontWeight: '700', color: Brand.primary },
  teamsBlock: { marginTop: 24 },
  emptyText: { fontSize: 14, color: Brand.textMuted },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  teamRowChevron: { fontSize: 13, fontWeight: '700', color: Brand.primary },
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
