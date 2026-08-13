import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerSearchInviteList } from '@/components/player-search-invite-list';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { WizardStepper } from '@/components/wizard-stepper';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { createTeam, getTeamDetail, listMyTeams, type TeamDetail, type TeamListItem } from '@/lib/teams';
import { registerTeamForTournament } from '@/lib/tournament-teams';
import { getTournamentDetail, type Tournament } from '@/lib/tournaments';

type Mode = 'create' | 'existing' | null;

export default function BuildTeamScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [eligibleTeams, setEligibleTeams] = useState<TeamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<Mode>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<TeamDetail | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setLoading(true);
    const [{ data }, teamsResult] = await Promise.all([getTournamentDetail(tournamentId), listMyTeams()]);
    setTournament(data);
    setNotFound(!data);
    if (data) {
      setEligibleTeams(
        teamsResult.data.filter(
          (team) => team.sport === data.sport && (team.my_role === 'owner' || team.my_role === 'admin'),
        ),
      );
    }
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refreshTeamDetail = useCallback(async () => {
    if (!teamId) return;
    const { data } = await getTeamDetail(teamId);
    setTeamDetail(data);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      if (stepIndex === 1) void refreshTeamDetail();
    }, [stepIndex, refreshTeamDetail]),
  );

  const playersPerTeam = tournament?.players_per_team ?? 1;
  const memberCount = teamDetail?.member_count ?? 0;
  const staffed = memberCount >= playersPerTeam;

  async function chooseCreateTeam(): Promise<TeamDetail | null> {
    if (!tournament) return null;
    if (newTeamName.trim().length < 3) {
      setError(t('tournamentTeamBuilder.newTeamNameError'));
      return null;
    }
    setBusy(true);
    setError(null);
    const { teamId: created, error: createErr } = await createTeam({
      name: newTeamName.trim(),
      sport: tournament.sport,
    });
    if (!created || createErr) {
      setBusy(false);
      setError(t('tournamentTeamBuilder.teamCreateError'));
      return null;
    }
    const { data } = await getTeamDetail(created);
    setBusy(false);
    setTeamId(created);
    setTeamDetail(data);
    return data;
  }

  async function chooseExistingTeam(): Promise<TeamDetail | null> {
    if (!teamId) {
      setError(t('tournamentTeamBuilder.step1Hint'));
      return null;
    }
    setBusy(true);
    const { data } = await getTeamDetail(teamId);
    setBusy(false);
    setTeamDetail(data);
    return data;
  }

  async function handleSubmit() {
    if (!tournamentId || !teamId) return;
    setBusy(true);
    setError(null);
    const result = await registerTeamForTournament(tournamentId, teamId);
    setBusy(false);
    if (result !== 'ok') {
      setError(
        result === 'team_too_small'
          ? t('tournamentTeamBuilder.teamTooSmallNotice')
          : t('tournamentTeamBuilder.submitError'),
      );
      return;
    }
    setDone(true);
  }

  async function goNext() {
    setError(null);
    if (stepIndex === 0) {
      const detail = mode === 'create' ? await chooseCreateTeam() : mode === 'existing' ? await chooseExistingTeam() : null;
      if (!detail) return;
      setStepIndex(detail.member_count >= playersPerTeam ? 2 : 1);
      return;
    }
    if (stepIndex === 1) {
      setStepIndex(2);
      return;
    }
    await handleSubmit();
  }

  function goBackStep() {
    setError(null);
    if (stepIndex === 0) {
      goBack((tournamentId ? `/tournament/${tournamentId}` : '/events') as Href);
      return;
    }
    setStepIndex((i) => Math.max(0, i - 1));
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
        <ScreenHeader insetTop={insets.top} onBack={() => goBack('/events' as Href)} />
        <Text style={styles.muted}>{t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} title={t('tournamentTeamBuilder.title')} onBack={() => goBack(`/tournament/${tournamentId}` as Href)} />
        <View style={styles.doneBlock}>
          <Text style={styles.doneText}>{t('tournamentTeamBuilder.submitSuccess')}</Text>
          <Pressable
            style={styles.doneBtn}
            onPress={() => router.replace({ pathname: '/tournament/[id]', params: { id: tournamentId ?? '' } })}>
            <Text style={styles.doneBtnText}>{t('common.back')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const stepTitle =
    stepIndex === 0
      ? t('tournamentTeamBuilder.step1Title')
      : stepIndex === 1
        ? t('tournamentTeamBuilder.step2Title')
        : t('tournamentTeamBuilder.step3Title');
  const stepHint =
    stepIndex === 0
      ? t('tournamentTeamBuilder.step1Hint')
      : stepIndex === 1
        ? t('tournamentTeamBuilder.step2Hint')
        : t('tournamentTeamBuilder.step3Hint');

  return (
    <View style={styles.flex}>
      <ScreenHeader insetTop={insets.top} title={t('tournamentTeamBuilder.title')} onBack={goBackStep} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <WizardStepper
          stepIndex={stepIndex}
          stepCount={3}
          stepTitle={stepTitle}
          stepHint={stepHint}
          onBack={goBackStep}
          onNext={() => void goNext()}
          nextLabel={stepIndex === 2 ? t('tournamentTeamBuilder.submitAction') : undefined}
          nextDisabled={busy || (stepIndex === 0 && !mode) || (stepIndex === 1 && !staffed)}>
          {stepIndex === 0 ? (
            <View style={styles.stepGap}>
              <Pressable
                style={[styles.optionCard, mode === 'create' && styles.optionCardActive]}
                onPress={() => {
                  setMode('create');
                  setTeamId(null);
                }}>
                <Text style={styles.optionText}>{t('tournamentTeamBuilder.createNewOption')}</Text>
              </Pressable>
              {mode === 'create' ? (
                <TextField
                  label={t('tournamentTeamBuilder.newTeamNameLabel')}
                  placeholder={t('tournamentTeamBuilder.newTeamNamePlaceholder')}
                  value={newTeamName}
                  onChangeText={setNewTeamName}
                />
              ) : null}

              <Pressable
                style={[styles.optionCard, mode === 'existing' && styles.optionCardActive]}
                onPress={() => setMode('existing')}>
                <Text style={styles.optionText}>{t('tournamentTeamBuilder.useExistingOption')}</Text>
              </Pressable>
              {mode === 'existing' ? (
                eligibleTeams.length === 0 ? (
                  <Text style={styles.hintText}>{t('tournamentTeamBuilder.noEligibleTeams')}</Text>
                ) : (
                  <View style={styles.teamChipsRow}>
                    {eligibleTeams.map((team) => (
                      <Pressable
                        key={team.team_id}
                        onPress={() => setTeamId(team.team_id)}
                        style={[styles.teamChip, teamId === team.team_id && styles.teamChipActive]}>
                        <Text style={[styles.teamChipText, teamId === team.team_id && styles.teamChipTextActive]}>
                          {team.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )
              ) : null}
            </View>
          ) : stepIndex === 1 ? (
            <View style={styles.stepGap}>
              <Text style={styles.progressText}>
                {t('tournamentTeamBuilder.rosterProgress')
                  .replace('{count}', String(memberCount))
                  .replace('{required}', String(playersPerTeam))}
              </Text>
              {teamId ? <PlayerSearchInviteList teamId={teamId} scrollEnabled={false} /> : null}
            </View>
          ) : (
            <View style={styles.stepGap}>
              <Text style={styles.sectionHeading}>{t('tournamentTeamBuilder.rosterSectionTitle')}</Text>
              {(teamDetail?.members ?? []).map((m) => (
                <View key={m.user_id} style={styles.memberRow}>
                  <UserAvatar nick={m.nick} avatarUrl={m.avatar_url} size={36} />
                  <Text style={styles.memberName}>{m.nick?.trim() || t('common.nick')}</Text>
                </View>
              ))}
              {!staffed ? <Text style={styles.hintText}>{t('tournamentTeamBuilder.teamTooSmallNotice')}</Text> : null}
            </View>
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </WizardStepper>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  stepGap: { gap: 12 },
  optionCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  optionCardActive: { borderColor: Brand.primary, backgroundColor: Brand.primaryMuted },
  optionText: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  hintText: { fontSize: 13, color: Brand.textMuted },
  teamChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  progressText: { fontSize: 14, fontWeight: '700', color: Brand.textSecondary },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberName: { fontSize: 15, color: Brand.textPrimary, fontWeight: '600' },
  errorText: { fontSize: 13, color: Brand.danger },
  doneBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 32 },
  doneText: { fontSize: 16, color: Brand.textPrimary, textAlign: 'center', fontWeight: '600' },
  doneBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.md,
  },
  doneBtnText: { color: Brand.primaryText, fontSize: 15, fontWeight: '700' },
});
