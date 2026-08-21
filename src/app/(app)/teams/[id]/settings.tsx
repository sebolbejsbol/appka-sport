import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { pickImageFromLibrary } from '@/lib/pick-image';
import { TEAM_SPORTS, formatTeamSport, type TeamSport } from '@/lib/sports';
import { uploadTeamLogo } from '@/lib/team-storage';
import {
  deleteTeam,
  getTeamDetail,
  transferTeamOwnership,
  updateTeam,
  type TeamDetail,
  type TeamMember,
} from '@/lib/teams';

export default function TeamSettingsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const teamId = params.id;

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState<TeamSport>('basketball');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState('image/jpeg');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    const { data } = await getTeamDetail(teamId);
    if (data) {
      setTeam(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setSport((data.sport as TeamSport) || 'basketball');
      setLogoUri(data.logo_url);
    }
    setLoading(false);
  }, [teamId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pickLogo() {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    setLogoUri(picked.uri);
    setLogoMime(picked.mimeType);
    setLogoBase64(picked.base64 ?? null);
  }

  async function handleSave() {
    if (!teamId || !team?.can_manage || busy) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      setError(t('teams.invalidName'));
      return;
    }

    setBusy(true);
    setError(null);

    let logoUrl = team.logo_url;
    if (logoUri && !logoUri.startsWith('http')) {
      const { publicUrl, error: uploadErr } = await uploadTeamLogo(
        teamId,
        logoUri,
        logoMime,
        logoBase64,
      );
      if (uploadErr) {
        setError(t('teams.saveError'));
        setBusy(false);
        return;
      }
      logoUrl = publicUrl;
    }

    const result = await updateTeam(teamId, {
      name: name.trim(),
      description: description.trim() || null,
      sport,
      logoUrl,
    });

    setBusy(false);
    if (result !== 'ok') {
      setError(t('teams.saveError'));
      return;
    }
    router.back();
  }

  function confirmTransfer(member: TeamMember) {
    confirmAction(
      t('teams.transferOwnership'),
      t('teams.transferConfirm'),
      t('teams.transferOwnership'),
      t('common.cancel'),
      () =>
        void (async () => {
          if (!teamId) return;
          setBusy(true);
          await transferTeamOwnership(teamId, member.user_id);
          setBusy(false);
          router.back();
        })(),
    );
  }

  function confirmDelete() {
    if (!teamId) return;
    confirmAction(
      t('teams.deleteTeam'),
      t('teams.deleteConfirm'),
      t('teams.deleteTeam'),
      t('common.cancel'),
      () =>
        void (async () => {
          setBusy(true);
          const result = await deleteTeam(teamId);
          setBusy(false);
          if (result === 'deleted') {
            router.replace('/teams' as Href);
          } else {
            setError(t('teams.saveError'));
          }
        })(),
      true,
    );
  }

  if (!teamId) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.settings')}
        onBack={() => goBack(`/teams/${teamId}` as Href)}
      />

      {loading || !team ? (
        <Text style={styles.muted}>…</Text>
      ) : !team.can_manage ? (
        <Text style={styles.error}>{t('teams.loadError')}</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {/* Profil drużyny */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('teams.settingsProfile')}</Text>

            <Pressable
              onPress={() => void pickLogo()}
              style={({ pressed }) => [styles.logoPicker, pressed && styles.logoPickerPressed]}>
              {logoUri ? (
                <>
                  <Image source={{ uri: logoUri }} style={styles.logoPreview} />
                  <View style={styles.logoEditBadge}>
                    <Text style={styles.logoEditIcon}>✎</Text>
                  </View>
                </>
              ) : (
                <Text style={styles.logoPlaceholder}>＋</Text>
              )}
            </Pressable>
            <Text style={styles.logoHint}>{t('teams.settingsLogoHint')}</Text>

            <TextField
              label={t('teams.nameLabel')}
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
            <Text style={styles.counter}>{t('teams.nameCounter').replace('{count}', String(name.trim().length))}</Text>

            <TextField
              label={t('teams.descriptionLabel')}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={1000}
              style={styles.descriptionInput}
            />
            <Text style={styles.counter}>
              {t('teams.descriptionCounter').replace('{count}', String(description.length))}
            </Text>

            <Text style={styles.label}>{t('teams.sportLabel')}</Text>
            <View style={styles.chips}>
              {TEAM_SPORTS.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setSport(item)}
                  style={[styles.chip, sport === item && styles.chipActive]}>
                  <Text style={[styles.chipText, sport === item && styles.chipTextActive]}>
                    {formatTeamSport(item)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button label={t('teams.save')} onPress={() => void handleSave()} disabled={busy} />
          </View>

          {/* Własność i administracja */}
          {team.is_owner ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('teams.ownershipSection')}</Text>
              <Text style={styles.dangerHint}>{t('teams.transferHint')}</Text>
              {team.members.filter((m) => m.role !== 'owner').length === 0 ? (
                <Text style={styles.muted}>{t('teams.noTransferTargets')}</Text>
              ) : (
                team.members
                  .filter((m) => m.role !== 'owner')
                  .map((member) => (
                    <Pressable
                      key={member.user_id}
                      onPress={() => confirmTransfer(member)}
                      disabled={busy}
                      style={({ pressed }) => [styles.transferRow, pressed && styles.deletePressed]}>
                      <UserAvatar nick={member.nick} avatarUrl={member.avatar_url} size={40} />
                      <Text style={styles.transferName}>
                        {member.nick?.trim() || t('common.nick')}
                      </Text>
                      <Text style={styles.transferArrow}>›</Text>
                    </Pressable>
                  ))
              )}
            </View>
          ) : null}

          {/* Strefa niebezpieczna */}
          {team.is_owner ? (
            <View style={[styles.card, styles.dangerCard]}>
              <Text style={styles.dangerTitle}>{t('teams.dangerZone')}</Text>
              <Text style={styles.dangerHint}>{t('teams.deleteHint')}</Text>
              <Pressable
                onPress={confirmDelete}
                disabled={busy}
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.deletePressed]}>
                <Text style={styles.deleteBtnText}>🗑 {t('teams.deleteTeam')}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Brand.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '800',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  logoPicker: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPickerPressed: {
    opacity: 0.85,
  },
  logoPreview: { width: '100%', height: '100%' },
  logoPlaceholder: {
    fontFamily: BrandFonts.bodyBold, color: Brand.primary, fontWeight: '700', fontSize: 32 },
  logoEditBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Brand.surface,
  },
  logoEditIcon: {
    fontFamily: BrandFonts.bodyBold, color: Brand.primaryText, fontSize: 13, fontWeight: '800' },
  logoHint: {
    fontFamily: BrandFonts.body, fontSize: 12, color: Brand.textMuted, textAlign: 'center' },
  counter: {
    fontFamily: BrandFonts.body, fontSize: 12, color: Brand.textMuted, textAlign: 'right', marginTop: -6 },
  descriptionInput: { minHeight: 88, textAlignVertical: 'top' },
  label: {
    fontFamily: BrandFonts.bodySemibold, fontSize: 14, fontWeight: '600', color: Brand.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: {
    fontFamily: BrandFonts.bodySemibold, fontSize: 13, fontWeight: '600', color: Brand.textPrimary },
  chipTextActive: { color: Brand.primaryText },
  error: { color: Brand.danger },
  muted: {
    fontFamily: BrandFonts.body, color: Brand.textMuted, fontSize: 14 },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  transferName: {
    fontFamily: BrandFonts.bodySemibold, flex: 1, fontSize: 15, fontWeight: '600', color: Brand.textPrimary },
  transferArrow: {
    fontFamily: BrandFonts.bodyBold, fontSize: 22, color: Brand.textMuted, fontWeight: '700' },
  dangerCard: {
    borderColor: '#fecaca',
  },
  dangerTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '800',
    color: Brand.danger,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dangerHint: {
    fontFamily: BrandFonts.body, fontSize: 13, color: Brand.textMuted, lineHeight: 18 },
  deleteBtn: {
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Brand.danger,
    backgroundColor: '#fef2f2',
  },
  deletePressed: { opacity: 0.85 },
  deleteBtnText: {
    fontFamily: BrandFonts.bodyBold, color: Brand.danger, fontWeight: '800', fontSize: 15 },
});
