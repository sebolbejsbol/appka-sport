import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import {
  TournamentForm,
  emptyTournamentFormValue,
  tournamentFormValueToInput,
  validateTournamentForm,
} from '@/components/tournament-form';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { createTournament, updateTournament } from '@/lib/tournaments';
import { uploadTournamentLogo } from '@/lib/tournament-storage';

export default function CreateTournamentScreen() {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(emptyTournamentFormValue());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(patch: Partial<typeof value>) {
    setValue((prev) => ({ ...prev, ...patch }));
  }

  async function handleCreate() {
    const validationError = validateTournamentForm(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    const input = tournamentFormValueToInput(value);
    const result = await createTournament(input);

    if (result.status !== 'ok') {
      setError(t('tournamentForm.createError'));
      setBusy(false);
      return;
    }

    if (value.logoUri && value.logoBase64) {
      const { publicUrl } = await uploadTournamentLogo(
        result.tournamentId,
        value.logoUri,
        value.logoMime,
        value.logoBase64,
      );
      if (publicUrl) {
        await updateTournament(result.tournamentId, { ...input, logoUrl: publicUrl });
      }
    }

    setBusy(false);
    router.replace({
      pathname: '/admin/tournaments/[id]/edit',
      params: { id: result.tournamentId },
    } as Href);
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('tournamentForm.createTitle')}
        onBack={() => goBack('/admin/tournaments' as Href)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <TournamentForm value={value} onChange={onChange} disabled={busy} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label={t('tournamentForm.createAction')} onPress={handleCreate} disabled={busy} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  errorText: { fontSize: 14, color: Brand.danger, marginTop: 12 },
  submit: { marginTop: 20 },
});
