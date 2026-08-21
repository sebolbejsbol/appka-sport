import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { Brand, BrandFonts } from '@/constants/theme';
import { t } from '@/i18n';
import { createTeam } from '@/lib/teams';

type Props = {
  visible: boolean;
  sport: string;
  tournamentId: string;
  onClose: () => void;
  onCreated: (teamId: string) => void;
};

export function CreateTeamModal({ visible, sport, tournamentId, onClose, onCreated }: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setName('');
    setError(null);
    onClose();
  }

  async function handleCreate() {
    if (name.trim().length < 3) {
      setError(t('tournamentTeamRoster.newTeamNameError'));
      return;
    }
    setBusy(true);
    setError(null);
    const { teamId, error: createErr } = await createTeam({ name: name.trim(), sport, tournamentId });
    setBusy(false);
    if (!teamId || createErr) {
      setError(t('tournamentTeamRoster.teamCreateError'));
      return;
    }
    setName('');
    onCreated(teamId);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('tournamentTeamRoster.createTeamTitle')}</Text>
          <TextField
            label={t('tournamentTeamRoster.newTeamNameLabel')}
            placeholder={t('tournamentTeamRoster.newTeamNamePlaceholder')}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label={t('common.cancel')} variant="secondary" onPress={handleClose} disabled={busy} style={styles.actionBtn} />
            <Button
              label={t('tournamentTeamRoster.createAction')}
              onPress={() => void handleCreate()}
              disabled={busy}
              style={styles.actionBtn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Brand.border,
    marginBottom: 4,
  },
  title: { fontFamily: BrandFonts.bodyBold, fontSize: 18, fontWeight: '700', color: Brand.textPrimary },
  errorText: { fontFamily: BrandFonts.body, fontSize: 13, color: Brand.danger },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: { flex: 1 },
});
