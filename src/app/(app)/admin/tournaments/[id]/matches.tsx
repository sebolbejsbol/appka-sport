import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import {
  adminRecordMatchResult,
  adminResetMatch,
  listTournamentMatches,
  type TournamentMatch,
} from '@/lib/tournament-matches';
import { getTournamentDetail, type Tournament } from '@/lib/tournaments';

function groupByGroupId(matches: TournamentMatch[]): { group_id: string; group_name: string; items: TournamentMatch[] }[] {
  const order: string[] = [];
  const map: Record<string, { group_id: string; group_name: string; items: TournamentMatch[] }> = {};
  for (const m of matches) {
    if (!map[m.group_id]) {
      map[m.group_id] = { group_id: m.group_id, group_name: m.group_name, items: [] };
      order.push(m.group_id);
    }
    map[m.group_id].items.push(m);
  }
  return order.map((id) => map[id]);
}

export default function ManageTournamentMatchesScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});
  const [scoreInputs, setScoreInputs] = useState<Record<string, { a: string; b: string }>>({});

  const load = useCallback(async () => {
    if (!tournamentId || !isAdmin) return;
    setLoading(true);
    const [{ data: detail, error: detailError }, matchesResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentMatches(tournamentId),
    ]);
    setTournament(detail);
    setMatches(matchesResult.data);
    setLoadError(Boolean(detailError || matchesResult.error));
    setLoading(false);
  }, [tournamentId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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
    const result = await adminRecordMatchResult(matchId, scoreA, scoreB);
    setBusyId(null);
    if (result === 'draws_not_allowed') {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentMatches.drawsNotAllowed') }));
      return;
    }
    if (result !== 'ok') {
      setActionError((prev) => ({ ...prev, [matchId]: t('tournamentMatches.actionError') }));
      return;
    }
    void load();
  }

  function confirmReset(matchId: string) {
    confirmAction(
      t('tournamentMatches.resetConfirmTitle'),
      t('tournamentMatches.resetConfirmMessage'),
      t('tournamentMatches.resetAction'),
      t('common.cancel'),
      () => void handleReset(matchId),
      true,
    );
  }

  async function handleReset(matchId: string) {
    setBusyId(matchId);
    setActionError((prev) => ({ ...prev, [matchId]: '' }));
    const result = await adminResetMatch(matchId);
    setBusyId(null);
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
        <ScreenHeader insetTop={insets.top} title={t('tournamentMatches.manageTitle')} onBack={() => goBack('/admin/tournaments' as Href)} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  const groups = groupByGroupId(matches);

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={tournament ? `${t('tournamentMatches.manageTitle')} — ${tournament.name}` : t('tournamentMatches.manageTitle')}
        onBack={() => goBack({ pathname: '/admin/tournaments/[id]/edit', params: { id: tournamentId ?? '' } } as Href)}
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('tournamentMatches.loadError')}</Text>
      ) : groups.length === 0 ? (
        <Text style={styles.muted}>{t('tournamentMatches.noMatchesYet')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {groups.map((group) => (
            <View key={group.group_id} style={styles.groupSection}>
              <Text style={styles.groupHeading}>{group.group_name}</Text>
              {group.items.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Text style={styles.rowTitle}>
                    {m.team_a_name} {t('tournamentMatches.vsLabel')} {m.team_b_name}
                  </Text>

                  {m.status === 'completed' ? (
                    <View style={styles.completedRow}>
                      <Text style={styles.finalScoreText}>{m.score_a} – {m.score_b}</Text>
                      <Button
                        label={t('tournamentMatches.resetAction')}
                        variant="secondary"
                        onPress={() => confirmReset(m.id)}
                        disabled={busyId === m.id}
                        style={styles.resetBtn}
                      />
                    </View>
                  ) : (
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
                  )}

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
  muted: { fontSize: 15, fontFamily: BrandFonts.body, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  groupSection: { marginTop: 20 },
  groupHeading: { fontSize: 16, fontWeight: '700', fontFamily: BrandFonts.bodyBold, color: Brand.textPrimary, marginBottom: 8 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Brand.border, gap: 8 },
  rowTitle: { fontSize: 14, fontWeight: '600', fontFamily: BrandFonts.bodySemibold, color: Brand.textPrimary },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreInput: {
    width: 64,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: BrandFonts.monoMedium,
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  saveBtn: { flex: 1 },
  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  finalScoreText: { fontSize: 16, fontWeight: '700', fontFamily: BrandFonts.monoSemibold, fontVariant: ['tabular-nums'], color: Brand.textPrimary, minWidth: 64 },
  resetBtn: { flex: 1 },
  actionErrorText: { fontSize: 12, fontFamily: BrandFonts.body, color: Brand.danger },
});
