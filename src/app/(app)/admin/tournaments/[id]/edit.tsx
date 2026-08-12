import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import {
  TournamentForm,
  tournamentFormValueToInput,
  tournamentToFormValue,
  validateTournamentForm,
  type TournamentFormValue,
} from '@/components/tournament-form';
import { Brand } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { uploadTournamentLogo } from '@/lib/tournament-storage';
import {
  TOURNAMENT_STATUS_TRANSITIONS,
  getTournamentDetail,
  setTournamentStatus,
  updateTournament,
  type Tournament,
  type TournamentStatus,
} from '@/lib/tournaments';

function transitionLabel(current: TournamentStatus, target: TournamentStatus): string {
  if (target === 'registration_open') {
    return current === 'registration_closed'
      ? t('tournamentForm.transitionReopenRegistration')
      : t('tournamentForm.transitionOpenRegistration');
  }
  switch (target) {
    case 'registration_closed': return t('tournamentForm.transitionCloseRegistration');
    case 'ready': return t('tournamentForm.transitionMarkReady');
    case 'in_progress': return t('tournamentForm.transitionStart');
    case 'completed': return t('tournamentForm.transitionComplete');
    case 'cancelled': return t('tournamentForm.transitionCancel');
    default: return t('tournamentForm.transitionOpenRegistration');
  }
}

export default function EditTournamentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [value, setValue] = useState<TournamentFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: fetchError } = await getTournamentDetail(tournamentId);
    if (data) {
      setTournament(data);
      setValue(tournamentToFormValue(data));
    } else {
      setNotFound(true);
      setLoadFailed(Boolean(fetchError));
    }
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function onChange(patch: Partial<TournamentFormValue>) {
    setValue((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  const editable = tournament?.status === 'draft' || tournament?.status === 'registration_open';

  async function handleSave() {
    if (!tournamentId || !value || !editable) return;
    const validationError = validateTournamentForm(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    const input = tournamentFormValueToInput(value);
    let logoUrl = input.logoUrl;
    if (value.logoUri && !value.logoUri.startsWith('http')) {
      const { publicUrl, error: uploadErr } = await uploadTournamentLogo(
        tournamentId,
        value.logoUri,
        value.logoMime,
        value.logoBase64,
      );
      if (uploadErr) {
        setError(t('tournamentForm.saveError'));
        setBusy(false);
        return;
      }
      logoUrl = publicUrl;
    }

    const result = await updateTournament(tournamentId, { ...input, logoUrl });
    setBusy(false);

    if (result !== 'ok') {
      setError(t('tournamentForm.saveError'));
      return;
    }
    void load();
  }

  function confirmTransition(target: TournamentStatus) {
    const label = transitionLabel(tournament?.status ?? 'draft', target);
    confirmAction(
      t('tournamentForm.transitionConfirmTitle'),
      t('tournamentForm.transitionConfirmMessage'),
      label,
      t('common.cancel'),
      () => void handleTransition(target),
      target === 'cancelled',
    );
  }

  async function handleTransition(target: TournamentStatus) {
    if (!tournamentId) return;
    setBusy(true);
    setError(null);
    const result = await setTournamentStatus(tournamentId, target);
    setBusy(false);
    if (result === 'not_enough_teams') {
      setError(t('tournamentForm.transitionNotEnoughTeams'));
      return;
    }
    if (result !== 'ok') {
      setError(t('tournamentForm.transitionError'));
      return;
    }
    void load();
  }

  if (roleLoading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.flex}>
        <ScreenHeader
          insetTop={insets.top}
          title={t('tournamentForm.editTitle')}
          onBack={() => goBack('/admin/tournaments' as Href)}
        />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (notFound || !value) {
    return (
      <View style={styles.flex}>
        <ScreenHeader
          insetTop={insets.top}
          title={t('tournamentForm.editTitle')}
          onBack={() => goBack('/admin/tournaments' as Href)}
        />
        <Text style={styles.muted}>{loadFailed ? t('tournamentDetail.loadError') : t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  const legalTransitions = tournament ? TOURNAMENT_STATUS_TRANSITIONS[tournament.status] : [];

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('tournamentForm.editTitle')}
        onBack={() => goBack('/admin/tournaments' as Href)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {!editable ? <Text style={styles.notice}>{t('tournamentForm.lockedNotice')}</Text> : null}

          <TournamentForm value={value} onChange={onChange} disabled={busy || !editable} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editable ? (
            <Button label={t('tournamentForm.saveAction')} onPress={handleSave} disabled={busy} style={styles.submit} />
          ) : null}

          <Button
            label={t('tournamentTeams.manageTitle')}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/admin/tournaments/[id]/teams', params: { id: tournamentId ?? '' } })
            }
            style={styles.manageTeamsBtn}
          />

          {legalTransitions.length > 0 ? (
            <View style={styles.transitions}>
              <Text style={styles.sectionTitle}>{t('tournamentForm.statusTransitions')}</Text>
              {legalTransitions.map((target) => (
                <Button
                  key={target}
                  label={transitionLabel(tournament?.status ?? 'draft', target)}
                  variant={target === 'cancelled' ? 'danger' : 'secondary'}
                  onPress={() => confirmTransition(target)}
                  disabled={busy}
                  style={styles.transitionBtn}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  notice: {
    fontSize: 14,
    color: Brand.textSecondary,
    backgroundColor: Brand.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: Brand.danger, marginTop: 12 },
  submit: { marginTop: 20 },
  manageTeamsBtn: { marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 },
  transitions: { marginTop: 28, gap: 10 },
  transitionBtn: { marginTop: 0 },
});
