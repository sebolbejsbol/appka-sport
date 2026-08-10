import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { t } from '@/i18n';
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

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [value, setValue] = useState<TournamentFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const { data } = await getTournamentDetail(tournamentId);
    if (data) {
      setTournament(data);
      setValue(tournamentToFormValue(data));
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
    if (value.logoBase64 && value.logoUri) {
      const { publicUrl } = await uploadTournamentLogo(tournamentId, value.logoUri, value.logoMime, value.logoBase64);
      if (publicUrl) logoUrl = publicUrl;
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
    Alert.alert(t('tournamentForm.transitionConfirmTitle'), t('tournamentForm.transitionConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: label, onPress: () => void handleTransition(target) },
    ]);
  }

  async function handleTransition(target: TournamentStatus) {
    if (!tournamentId) return;
    setBusy(true);
    setError(null);
    const result = await setTournamentStatus(tournamentId, target);
    setBusy(false);
    if (result !== 'ok') {
      setError(t('tournamentForm.transitionError'));
      return;
    }
    void load();
  }

  if (loading || !value) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 },
  transitions: { marginTop: 28, gap: 10 },
  transitionBtn: { marginTop: 0 },
});
