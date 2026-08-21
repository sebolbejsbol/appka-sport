import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import {
  adminAssignTeamGroup,
  adminRemoveTeamRegistration,
  adminRespondTeamRegistration,
  listTournamentTeamRegistrations,
  type TournamentTeamRegistration,
} from '@/lib/tournament-teams';
import { autoOrganizeTournament, getTournamentDetail, type AutoOrganizeResult, type Tournament } from '@/lib/tournaments';

function organizeErrorMessage(result: AutoOrganizeResult): string {
  switch (result) {
    case 'invalid_status': return t('tournamentTeams.autoOrganizeErrorInvalidStatus');
    case 'not_enough_teams': return t('tournamentTeams.autoOrganizeErrorNotEnoughTeams');
    default: return t('tournamentTeams.autoOrganizeError');
  }
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function filterLabel(filter: StatusFilter): string {
  switch (filter) {
    case 'pending': return t('tournamentTeams.filterPending');
    case 'approved': return t('tournamentTeams.filterApproved');
    case 'rejected': return t('tournamentTeams.filterRejected');
    default: return t('tournamentTeams.filterAll');
  }
}

function rowStatusLabel(status: TournamentTeamRegistration['status']): string {
  switch (status) {
    case 'pending': return t('tournamentTeams.filterPending');
    case 'approved': return t('tournamentTeams.filterApproved');
    case 'rejected': return t('tournamentTeams.filterRejected');
    case 'withdrawn': return t('tournamentTeams.statusWithdrawnShort');
  }
}

export default function ManageTournamentTeamsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<TournamentTeamRegistration[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [organizeBusy, setOrganizeBusy] = useState(false);
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [organizeSuccess, setOrganizeSuccess] = useState<'direct' | 'groups' | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId || !isAdmin) return;
    setLoading(true);
    const [{ data: detail, error: detailError }, regsResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentTeamRegistrations(tournamentId, true),
    ]);
    setTournament(detail);
    setRegistrations(regsResult.data);
    setLoadError(Boolean(detailError || regsResult.error));
    setLoading(false);
  }, [tournamentId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = registrations.filter((r) => filter === 'all' || r.status === filter);
  const pendingCount = registrations.filter((r) => r.status === 'pending').length;

  async function handleRespond(registrationId: string, accept: boolean) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminRespondTeamRegistration(registrationId, accept);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  function confirmRemove(registrationId: string) {
    confirmAction(
      t('tournamentTeams.removeConfirmTitle'),
      t('tournamentTeams.removeConfirmMessage'),
      t('tournamentTeams.removeAction'),
      t('common.cancel'),
      () => void handleRemove(registrationId),
      true,
    );
  }

  async function handleRemove(registrationId: string) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminRemoveTeamRegistration(registrationId);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  async function handleAssignGroup(registrationId: string, groupId: string | null) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminAssignTeamGroup(registrationId, groupId);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  function confirmOrganize() {
    confirmAction(
      t('tournamentTeams.autoOrganizeConfirmTitle'),
      t('tournamentTeams.autoOrganizeConfirmMessage'),
      t('tournamentTeams.autoOrganizeAction'),
      t('common.cancel'),
      () => void handleOrganize(),
      false,
    );
  }

  async function handleOrganize() {
    if (!tournamentId) return;
    setOrganizeBusy(true);
    setOrganizeError(null);
    setOrganizeSuccess(null);
    const result = await autoOrganizeTournament(tournamentId);
    setOrganizeBusy(false);
    if (result !== 'ok') {
      setOrganizeError(organizeErrorMessage(result));
      return;
    }
    const { data: fresh } = await getTournamentDetail(tournamentId);
    setOrganizeSuccess(fresh?.status === 'in_progress' ? 'direct' : 'groups');
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
        <ScreenHeader insetTop={insets.top} title={t('tournamentTeams.manageTitle')} onBack={() => goBack('/admin/tournaments' as Href)} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={tournament ? `${t('tournamentTeams.manageTitle')} — ${tournament.name}` : t('tournamentTeams.manageTitle')}
        onBack={() => goBack({ pathname: '/admin/tournaments/[id]/edit', params: { id: tournamentId ?? '' } } as Href)}
      />

      {tournament && tournament.status === 'registration_closed' ? (
        <View style={styles.organizeBlock}>
          <Button
            label={t('tournamentTeams.autoOrganizeAction')}
            onPress={confirmOrganize}
            disabled={organizeBusy}
            style={styles.organizeBtn}
          />
          {organizeError ? <Text style={styles.actionErrorText}>{organizeError}</Text> : null}
        </View>
      ) : null}
      {organizeSuccess ? (
        <Text style={styles.organizeSuccessText}>
          {organizeSuccess === 'direct'
            ? t('tournamentTeams.autoOrganizeSuccessBracket')
            : t('tournamentTeams.autoOrganizeSuccessGroups')}
        </Text>
      ) : null}

      <View style={styles.filtersRow}>
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {filterLabel(f)}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('tournamentTeams.loadError')}</Text>
      ) : visible.length === 0 ? (
        <Text style={styles.muted}>{t('tournamentTeams.empty404')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {visible.map((reg) => (
            <View key={reg.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{reg.team_name}</Text>
                <Text style={styles.rowStatus}>{rowStatusLabel(reg.status)}</Text>
              </View>

              {reg.status === 'pending' ? (
                <View style={styles.actionsRow}>
                  <Button
                    label={t('tournamentTeams.approveAction')}
                    onPress={() => void handleRespond(reg.id, true)}
                    disabled={busyId === reg.id}
                    style={styles.actionBtn}
                  />
                  <Button
                    label={t('tournamentTeams.rejectAction')}
                    variant="secondary"
                    onPress={() => void handleRespond(reg.id, false)}
                    disabled={busyId === reg.id}
                    style={styles.actionBtn}
                  />
                </View>
              ) : null}

              {reg.status === 'approved' ? (
                <>
                  <View style={styles.actionsRow}>
                    <Button
                      label={t('tournamentTeams.removeAction')}
                      variant="danger"
                      onPress={() => confirmRemove(reg.id)}
                      disabled={busyId === reg.id}
                      style={styles.actionBtn}
                    />
                  </View>
                  {tournament && tournament.groups.length > 0 ? (
                    <View style={styles.groupRow}>
                      <Text style={styles.groupLabel}>{t('tournamentTeams.assignGroupLabel')}:</Text>
                      <Pressable
                        onPress={() => void handleAssignGroup(reg.id, null)}
                        style={[styles.groupChip, !reg.group_id && styles.groupChipActive]}>
                        <Text style={[styles.groupChipText, !reg.group_id && styles.groupChipTextActive]}>
                          {t('tournamentTeams.assignGroupNone')}
                        </Text>
                      </Pressable>
                      {tournament.groups.map((g) => (
                        <Pressable
                          key={g.id}
                          onPress={() => void handleAssignGroup(reg.id, g.id)}
                          style={[styles.groupChip, reg.group_id === g.id && styles.groupChipActive]}>
                          <Text
                            style={[
                              styles.groupChipText,
                              reg.group_id === g.id && styles.groupChipTextActive,
                            ]}>
                            {g.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
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
  actionErrorText: { fontFamily: BrandFonts.body, fontSize: 13, color: Brand.danger, marginTop: 8, marginHorizontal: 20 },
  organizeBlock: { paddingHorizontal: 20, marginTop: 12, gap: 8 },
  organizeBtn: { alignSelf: 'flex-start' },
  organizeSuccessText: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
    marginTop: 8,
    marginHorizontal: 20,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  filterChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  filterChipText: { fontFamily: BrandFonts.bodySemibold, fontSize: 13, fontWeight: '600', color: Brand.textPrimary },
  filterChipTextActive: { color: Brand.primaryText },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
    gap: 10,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontFamily: BrandFonts.bodyBold, fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  rowStatus: { fontFamily: BrandFonts.bodySemibold, fontSize: 12, fontWeight: '600', color: Brand.textMuted },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  groupLabel: { fontFamily: BrandFonts.body, fontSize: 13, color: Brand.textSecondary, marginRight: 2 },
  groupChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  groupChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  groupChipText: { fontFamily: BrandFonts.bodySemibold, fontSize: 12, fontWeight: '600', color: Brand.textPrimary },
  groupChipTextActive: { color: Brand.primaryText },
});
