import { router, type Href } from 'expo-router';
import { useState } from 'react';
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
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import {
  EVENT_CATEGORIES,
  categoryEmoji,
  categoryLabel,
  markerEmoji,
  subcategoriesFor,
} from '@/lib/event-categories';
import { goBack } from '@/lib/navigation';
import { pickImageFromLibrary } from '@/lib/pick-image';
import { mapTeamError } from '@/lib/team-errors';
import { uploadTeamLogo } from '@/lib/team-storage';
import { createTeam, updateTeam } from '@/lib/teams';

const CUSTOM = '__custom__';

export default function CreateTeamScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState<string>('');
  const [customSport, setCustomSport] = useState('');
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [logoMime, setLogoMime] = useState('image/jpeg');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = sport === CUSTOM;
  const resolvedSport = isCustom ? customSport.trim() : sport;
  const canCreate = name.trim().length >= 2 && resolvedSport.length >= 1 && !busy;

  async function pickLogo() {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    setLogoUri(picked.uri);
    setLogoMime(picked.mimeType);
    setLogoBase64(picked.base64 ?? null);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 2 || resolvedSport.length < 1 || busy) return;

    setBusy(true);
    setError(null);

    const { teamId, error: createErr } = await createTeam({
      name: trimmed,
      description: description.trim() || undefined,
      sport: resolvedSport,
    });

    if (createErr || !teamId) {
      setError(mapTeamError(createErr?.message));
      setBusy(false);
      return;
    }

    if (logoUri) {
      const { publicUrl, error: uploadErr } = await uploadTeamLogo(
        teamId,
        logoUri,
        logoMime,
        logoBase64,
      );
      if (!uploadErr && publicUrl) {
        await updateTeam(teamId, { logoUrl: publicUrl });
      }
    }

    setBusy(false);
    router.replace(`/teams/${teamId}` as Href);
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.newTitle')}
        onBack={() => goBack('/teams' as Href)}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Pressable onPress={() => void pickLogo()} style={styles.logoPicker}>
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoPreview} />
            ) : (
              <Text style={styles.logoPlaceholder}>{t('teams.pickLogo')}</Text>
            )}
          </Pressable>

          <TextField
            label={t('teams.nameLabel')}
            placeholder={t('teams.namePlaceholder')}
            value={name}
            onChangeText={setName}
            maxLength={80}
          />

          <TextField
            label={t('teams.descriptionLabel')}
            placeholder={t('teams.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={1000}
            style={styles.descriptionInput}
          />

          <Text style={styles.label}>{t('teams.typeLabel')}</Text>
          <Text style={styles.typeHint}>{t('teams.typeHint')}</Text>

          {EVENT_CATEGORIES.map((category) => {
            const subs = subcategoriesFor(category);
            const options =
              subs.length > 0
                ? subs.map((s) => ({ id: s.id, label: s.label, emoji: markerEmoji(category, s.id) }))
                : [{ id: category, label: categoryLabel(category), emoji: categoryEmoji(category) }];
            return (
              <View key={category} style={styles.categoryBlock}>
                <Text style={styles.categoryTitle}>
                  {categoryEmoji(category)} {categoryLabel(category)}
                </Text>
                <View style={styles.chips}>
                  {options.map((item) => {
                    const active = !isCustom && sport === item.id;
                    return (
                      <Pressable
                        key={`${category}-${item.id}`}
                        onPress={() => setSport(item.id)}
                        style={[styles.chip, active && styles.chipActive]}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {item.emoji} {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}

          <View style={styles.categoryBlock}>
            <Text style={styles.categoryTitle}>✨ {t('teams.customOption')}</Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => setSport(CUSTOM)}
                style={[styles.chip, isCustom && styles.chipActive]}>
                <Text style={[styles.chipText, isCustom && styles.chipTextActive]}>
                  {t('teams.customOption')}
                </Text>
              </Pressable>
            </View>
            {isCustom ? (
              <TextField
                label={t('teams.customLabel')}
                placeholder={t('teams.customPlaceholder')}
                value={customSport}
                onChangeText={setCustomSport}
                maxLength={80}
                style={styles.customInput}
              />
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t('teams.createAction')}
            onPress={() => void handleCreate()}
            disabled={!canCreate}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  logoPicker: {
    alignSelf: 'center',
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPreview: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    color: Brand.primary,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  descriptionInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  typeHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: -8,
  },
  categoryBlock: {
    gap: 8,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  customInput: {
    marginTop: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  chipTextActive: {
    color: Brand.primaryText,
  },
  error: {
    color: Brand.danger,
    fontSize: 14,
  },
});
