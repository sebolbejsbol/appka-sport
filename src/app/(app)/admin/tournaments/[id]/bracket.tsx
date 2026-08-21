import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import {
  adminGenerateBracket,
  adminRecordPlayoffResult,
  listTournamentPlayoffBracket,
  type AdminGenerateBracketResult,
  type TournamentPlayoffMatch,
} from '@/lib/tournament-playoffs';
import { getTournamentDetail, type Tournament } from '@/lib/tournaments';

const TEAMS_PER_GROUP_ADVANCING = 2;

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

function generateErrorMessage(result: AdminGenerateBracketResult): string {
  switch (result) {
    case 'bracket_exists': return t('tournamentPlayoffs.bracketExists');
    case 'group_stage_incomplete': return t('tournamentPlayoffs.groupStageIncomplete');
    case 'not_enough_qualified_teams': return t('tournamentPlayoffs.notEnoughQualifiedTeams');
    case 'invalid_status': return t('tournamentPlayoffs.invalidStatusError');
    default: return t('tournamentPlayoffs.generateError');
  }
}

export default function ManageTournamentBracketScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [bracket, setBracket] = useState<TournamentPlayoffMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});

  const load = useCallback(async () => {
    if (!tournamentId || !isAdmin) return;
    setLoading(true);
    const [{ data: detail, error: detailError }, bracketResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentPlayoffBracket(tournamentId),
    ]);
    setTournament(detail);
    setBracket(bracketResult.data);
    setLoadError(Boolean(detailError || bracketResult.error));
    setLoading(false);
  }, [tournamentId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleGenerate() {
    if (!tournamentId) return;
    setGenerateBusy(true);
    setGenerateError(null);
    const result = await adminGenerateBracket(tournamentId, TEAMS_PER_GROUP_ADVANCING);
    setGenerateBusy(false);
    if (result !== 'ok') {
      setGenerateError(generateErrorMessage(result));
      return;
    }
    void load();
  }

  function setScoreField(matchId: string, side: 'a' | 'b', value: string) {
    const digits = value.replace(/[^0-9]/g, '');
    setScoreInputs((prev) => ({
      ...prev,
      [matchId]: { a: prev[matchId]?.a ?? '', b: prev[matchId]?.b ?? '', [side]: digits },
    }));
  }

  async function handleSaveResult(matchId: string) {
    const input = scoreInputs[matchId];
    const scoreA = Number(input?.a ?? '');
    const scoreB = Number(input?.b ?? '');
    if (!input?.a || !input?.b || Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentMatches.invalidScore') }));
      return;
    }
    setBusyId(matchId);
    setActionError((prev) => ({ ...prev, [matchId]: '' }));
    const result = await adminRecordPlayoffResult(matchId, scoreA, scoreB);
    setBusyId(null);
    if (result === 'draws_not_allowed') {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentPlayoffs.drawsNotAllowed') }));
      return;
    }
    if (result === 'not_scheduled') {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentPlayoffs.notScheduled') }));
      return;
    }
    if (result !== 'ok') {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentMatches.actionError') }));
      return;
    }
    void load();
  }

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('tournamentPlayoffs.bracketTitle')} onBack={() => goBack('/admin/tournaments' as Href)} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  const rounds = groupByRound(bracket);
  const totalRounds = rounds.length > 0 ? rounds[rounds.length - 1].round : 0;

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={tournament ? `${t('tournamentPlayoffs.bracketTitle')} — ${tournament.name}` : t('tournamentPlayoffs.bracketTitle')}
        onBack={() => goBack({ pathname: '/admin/tournaments/[id]/edit', params: { id: tournamentId ?? '' } } as Href)}
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('tournamentMatches.loadError')}</Text>
      ) : bracket.length === 0 ? (
        <View style={styles.generateBlock}>
          {tournament?.status === 'in_progress' ? (
            <>
              <Button
                label={t('tournamentPlayoffs.generateAction')}
                onPress={handleGenerate}
                disabled={generateBusy}
                style={styles.generateBtn}
              />
              {generateError ? <Text style={styles.actionErrorText}>{generateError}</Text> : null}
            </>
          ) : (
            <Text style={styles.muted}>{t('tournamentPlayoffs.emptyBracket')}</Text>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {rounds.map((r) => (
            <View key={r.round} style={styles.roundSection}>
              <Text style={styles.roundHeading}>{roundLabel(r.round, totalRounds)}</Text>
              {r.items.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Text style={styles.rowTitle}>
                    {m.team_a_name ?? t('tournamentPlayoffs.tbdLabel')} {t('tournamentMatches.vsLabel')} {m.team_b_name ?? t('tournamentPlayoffs.tbdLabel')}
                  </Text>

                  {m.status === 'completed' ? (
                    <Text style={styles.finalScoreText}>{m.score_a} – {m.score_b}</Text>
                  ) : m.status === 'scheduled' ? (
                    <View style={styles.scoreRow}>
                      <TextInput
                        style={styles.scoreInput}
                        keyboardType="number-pad"
                        placeholder={t('tournamentMatches.scoreALabel')}
                        placeholderTextColor={Brand.textMuted}
                        value={scoreInputs[m.id]?.a ?? ''}
                        onChangeText={(v) => setScoreField(m.id, 'a', v)}
                      />
                      <TextInput
                        style={styles.scoreInput}
                        keyboardType="number-pad"
                        placeholder={t('tournamentMatches.scoreBLabel')}
                        placeholderTextColor={Brand.textMuted}
                        value={scoreInputs[m.id]?.b ?? ''}
                        onChangeText={(v) => setScoreField(m.id, 'b', v)}
                      />
                      <Button
                        label={t('tournamentMatches.saveResultAction')}
                        onPress={() => void handleSaveResult(m.id)}
                        disabled={busyId === m.id}
                        style={styles.saveBtn}
                      />
                    </View>
                  ) : null}

                  {actionError[m.id] ? <Text style={styles.actionErrorText}>{actionError[m.id]}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontFamily: BrandFonts.body, fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  generateBlock: { paddingHorizontal: 20, marginTop: 24, gap: 10 },
  generateBtn: { marginTop: 4 },
  roundSection: { marginTop: 20 },
  roundHeading: { fontFamily: BrandFonts.bodyBold, fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Brand.border, gap: 8 },
  rowTitle: { fontFamily: BrandFonts.bodySemibold, fontSize: 14, fontWeight: '600', color: Brand.textPrimary },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreInput: {
    fontFamily: BrandFonts.monoMedium,
    fontVariant: ['tabular-nums'],
    width: 64,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  saveBtn: { flex: 1 },
  finalScoreText: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  actionErrorText: { fontFamily: BrandFonts.body, fontSize: 12, color: Brand.danger },
});
