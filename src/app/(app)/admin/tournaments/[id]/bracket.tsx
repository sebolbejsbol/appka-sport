import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TrophyIcon } from '@/components/icons';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
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

const CARD_WIDTH = 190;
const CARD_HEIGHT = 68;
const EDITABLE_EXTRA_HEIGHT = 46;
const ROUND_GAP = 70;
const ROW_GAP = 140;
const CANVAS_TOP_PAD = 44;
const CANVAS_SIDE_PAD = 20;

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
  order.sort((a, b) => a - b);
  return order.map((round) => ({
    round,
    items: [...map[round]].sort((a, b) => a.slot - b.slot),
  }));
}

/** Środek Y każdej karty per runda, wyliczony rekurencyjnie ze slotów (runda
 * 0 rozstawiona równomiernie, kolejne = średnia dwóch dzieci z poprzedniej
 * rundy) — jedyny sposób, żeby linie łączące trafiały dokładnie w środek
 * kart niezależnie od tego, ile drużyn ma dany turniej. */
function computeCenters(rounds: { round: number; items: TournamentPlayoffMatch[] }[]): number[][] {
  const centers: number[][] = [];
  rounds.forEach((r, roundIndex) => {
    if (roundIndex === 0) {
      centers.push(r.items.map((_, i) => CANVAS_TOP_PAD + i * ROW_GAP + CARD_HEIGHT / 2));
      return;
    }
    const prev = centers[roundIndex - 1];
    centers.push(
      r.items.map((_, i) => {
        const a = prev[2 * i];
        const b = prev[2 * i + 1];
        if (a == null) return prev[prev.length - 1] ?? CANVAS_TOP_PAD + CARD_HEIGHT / 2;
        if (b == null) return a;
        return (a + b) / 2;
      }),
    );
  });
  return centers;
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

  const rounds = useMemo(() => groupByRound(bracket), [bracket]);
  const totalRounds = rounds.length > 0 ? rounds[rounds.length - 1].round : 0;
  const centers = useMemo(() => computeCenters(rounds), [rounds]);

  const canvasWidth =
    CANVAS_SIDE_PAD * 2 + rounds.length * CARD_WIDTH + Math.max(0, rounds.length - 1) * ROUND_GAP + (rounds.length > 0 ? 90 : 0);
  const canvasHeight =
    rounds.length > 0
      ? CANVAS_TOP_PAD + (rounds[0].items.length - 1) * ROW_GAP + CARD_HEIGHT + EDITABLE_EXTRA_HEIGHT + 40
      : 0;

  const finalMatch = rounds.length > 0 ? rounds[rounds.length - 1].items[0] : null;
  const championName =
    finalMatch?.status === 'completed'
      ? finalMatch.winner_team_id === finalMatch.team_a_id
        ? finalMatch.team_a_name
        : finalMatch.team_b_name
      : null;

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
        <ScrollView contentContainerStyle={styles.vScroll} showsVerticalScrollIndicator={false}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}>
            <View style={[styles.canvas, { width: canvasWidth, height: canvasHeight }]}>
              {rounds.map((r, roundIndex) => (
                <Text
                  key={`label-${r.round}`}
                  style={[
                    styles.roundLabel,
                    { left: CANVAS_SIDE_PAD + roundIndex * (CARD_WIDTH + ROUND_GAP), width: CARD_WIDTH },
                  ]}>
                  {roundLabel(r.round, totalRounds)}
                </Text>
              ))}

              <Svg style={StyleSheet.absoluteFill} width={canvasWidth} height={canvasHeight}>
                {rounds.slice(1).map((r, ri) => {
                  const roundIndex = ri + 1;
                  const x1 = CANVAS_SIDE_PAD + (roundIndex - 1) * (CARD_WIDTH + ROUND_GAP) + CARD_WIDTH;
                  const xMid = x1 + ROUND_GAP / 2;
                  const x2 = CANVAS_SIDE_PAD + roundIndex * (CARD_WIDTH + ROUND_GAP);
                  return r.items.map((_, i) => {
                    const yTop = centers[roundIndex - 1]?.[2 * i];
                    const yBottom = centers[roundIndex - 1]?.[2 * i + 1];
                    const yTarget = centers[roundIndex]?.[i];
                    if (yTarget == null) return null;
                    const paths: string[] = [];
                    if (yTop != null) paths.push(`M${x1},${yTop} H${xMid} V${yTarget} H${x2}`);
                    if (yBottom != null) paths.push(`M${x1},${yBottom} H${xMid} V${yTarget} H${x2}`);
                    return paths.map((d, pi) => (
                      <Path key={`${r.round}-${i}-${pi}`} d={d} stroke={Brand.borderStrong} strokeWidth={2} fill="none" />
                    ));
                  });
                })}
              </Svg>

              {rounds.map((r, roundIndex) =>
                r.items.map((m, i) => {
                  const centerY = centers[roundIndex]?.[i] ?? CANVAS_TOP_PAD;
                  const left = CANVAS_SIDE_PAD + roundIndex * (CARD_WIDTH + ROUND_GAP);
                  const pending = m.status !== 'completed' && (!m.team_a_id || !m.team_b_id);
                  const editable = m.status === 'scheduled' && m.team_a_id && m.team_b_id;
                  const cardHeight = editable ? CARD_HEIGHT + EDITABLE_EXTRA_HEIGHT : CARD_HEIGHT;
                  const top = centerY - cardHeight / 2;

                  return (
                    <View
                      key={m.id}
                      style={[
                        styles.match,
                        { left, top, width: CARD_WIDTH },
                        pending && styles.matchPending,
                      ]}>
                      <MatchTeamRow
                        name={m.team_a_name}
                        isWinner={m.winner_team_id != null && m.winner_team_id === m.team_a_id}
                        score={m.status === 'completed' ? m.score_a : null}
                        editable={!!editable}
                        value={scoreInputs[m.id]?.a ?? ''}
                        onChangeValue={(v) => setScoreField(m.id, 'a', v)}
                      />
                      <View style={[styles.divider, pending && styles.dividerPending]} />
                      <MatchTeamRow
                        name={m.team_b_name}
                        isWinner={m.winner_team_id != null && m.winner_team_id === m.team_b_id}
                        score={m.status === 'completed' ? m.score_b : null}
                        editable={!!editable}
                        value={scoreInputs[m.id]?.b ?? ''}
                        onChangeValue={(v) => setScoreField(m.id, 'b', v)}
                      />

                      {editable ? (
                        <Button
                          label={t('tournamentMatches.saveResultAction')}
                          onPress={() => void handleSaveResult(m.id)}
                          disabled={busyId === m.id}
                          size="sm"
                          style={styles.saveBtn}
                        />
                      ) : null}
                      {actionError[m.id] ? (
                        <Text style={styles.cardError}>{actionError[m.id]}</Text>
                      ) : null}
                    </View>
                  );
                }),
              )}

              {championName ? (
                <View
                  style={[
                    styles.championWrap,
                    {
                      left:
                        CANVAS_SIDE_PAD +
                        rounds.length * (CARD_WIDTH + ROUND_GAP) -
                        ROUND_GAP +
                        20,
                      top: (centers[centers.length - 1]?.[0] ?? CANVAS_TOP_PAD) - 20,
                    },
                  ]}>
                  <View style={styles.championBadge}>
                    <TrophyIcon size={20} color={Brand.amberDark} strokeWidth={2} />
                  </View>
                  <Text style={styles.championName} numberOfLines={1}>
                    {championName}
                  </Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

function MatchTeamRow({
  name,
  isWinner,
  score,
  editable,
  value,
  onChangeValue,
}: {
  name: string | null;
  isWinner: boolean;
  score: number | null;
  editable: boolean;
  value: string;
  onChangeValue: (v: string) => void;
}) {
  const pending = !name;
  return (
    <View style={styles.team}>
      <Text
        style={[styles.teamName, isWinner && styles.teamNameWin, pending && styles.teamNamePending]}
        numberOfLines={1}>
        {name ?? t('tournamentPlayoffs.tbdLabel')}
      </Text>
      {editable ? (
        <TextInput
          style={styles.teamScoreInput}
          keyboardType="number-pad"
          value={value}
          onChangeText={onChangeValue}
          placeholder="–"
          placeholderTextColor="rgba(255,255,255,0.35)"
        />
      ) : score != null ? (
        <Text style={[styles.teamScore, isWinner && styles.teamScoreWin]}>{score}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontFamily: BrandFonts.body, fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  generateBlock: { paddingHorizontal: 20, marginTop: 24, gap: 10 },
  generateBtn: { marginTop: 4 },
  vScroll: { paddingTop: 8, paddingBottom: 24 },
  canvas: {
    position: 'relative',
  },
  roundLabel: {
    position: 'absolute',
    top: 4,
    textAlign: 'center',
    fontFamily: BrandFonts.monoSemibold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Brand.textMuted,
  },
  match: {
    position: 'absolute',
    backgroundColor: Brand.ink,
    borderRadius: 12,
    overflow: 'hidden',
    ...shadow('md'),
  },
  matchPending: {
    backgroundColor: Brand.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Brand.border,
    ...shadow('sm'),
  },
  team: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  teamName: {
    flex: 1,
    minWidth: 0,
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    color: '#ffffff',
  },
  teamNameWin: {
    color: Brand.pitch,
  },
  teamNamePending: {
    color: Brand.textMuted,
    fontStyle: 'italic',
  },
  teamScore: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  teamScoreWin: {
    color: Brand.pitch,
  },
  teamScoreInput: {
    width: 30,
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: '#ffffff',
    textAlign: 'center',
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.3)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerPending: {
    backgroundColor: Brand.divider,
  },
  saveBtn: {
    marginHorizontal: 10,
    marginBottom: 8,
    marginTop: 2,
    minHeight: 32,
    paddingVertical: 6,
  },
  cardError: {
    fontFamily: BrandFonts.body,
    fontSize: 10.5,
    color: '#ff9d9d',
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  championWrap: {
    position: 'absolute',
    width: 96,
    alignItems: 'center',
    gap: 6,
  },
  championBadge: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: Brand.amberLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  championName: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  actionErrorText: { fontFamily: BrandFonts.body, fontSize: 12, color: Brand.danger },
});
