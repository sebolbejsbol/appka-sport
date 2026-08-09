import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { uploadAvatar } from '@/lib/avatar-storage';
import { countryCodeToFlag, countryName } from '@/lib/countries';
import { goBack } from '@/lib/navigation';
import { markerEmoji, subcategoriesFor } from '@/lib/event-categories';
import { pickImageFromLibrary } from '@/lib/pick-image';
import {
  getOrCreateProfile,
  setOwnAvatar,
  updateProfile,
  type Gender,
} from '@/lib/profiles';

const INTEREST_SPORTS = subcategoriesFor('sport');
const BIO_MAX = 300;

type GenderOption = { value: Gender | null; label: string };

// Funkcja (nie stała modułowa!) — musi być wywoływana w renderze, żeby po
// zmianie języka etykiety przeliczyły się na nowo (stała liczona raz przy
// imporcie modułu zamrażałaby etykiety w języku sprzed startu aplikacji).
function buildGenderOptions(): GenderOption[] {
  return [
    { value: null, label: t('profile.genderUndisclosed') },
    { value: 'male', label: t('profile.genderMale') },
    { value: 'female', label: t('profile.genderFemale') },
    { value: 'other', label: t('profile.genderOther') },
  ];
}

export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const user = session?.user;
  const userId = user?.id;
  const GENDER_OPTIONS = buildGenderOptions();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [nick, setNick] = useState('');
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [showBirthYear, setShowBirthYear] = useState(true);
  const [gender, setGender] = useState<Gender | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [sports, setSports] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [avatarMime, setAvatarMime] = useState('image/jpeg');
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  const [saveError, setSaveError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;

    let active = true;
    getOrCreateProfile(user).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        setLoadError(true);
      } else {
        setNick(data.nick ?? '');
        setBirthYear(data.birth_year);
        setShowBirthYear(data.show_birth_year);
        setGender(data.gender);
        setCountryCode(data.country_code);
        setCity(data.city ?? '');
        setBio(data.bio ?? '');
        setSports(data.sports ?? []);
        setAvatarUrl(data.avatar_url);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [user]);

  async function handlePickAvatar() {
    const picked = await pickImageFromLibrary();
    if (!picked) return;
    setAvatarLocalUri(picked.uri);
    setAvatarMime(picked.mimeType);
    setAvatarBase64(picked.base64 ?? null);
  }

  async function handleSave() {
    if (!userId || saving) return;

    setSaved(false);
    setSaveError(false);
    setAvatarError(false);
    setSaving(true);

    try {
      if (avatarLocalUri) {
        const { publicUrl, error: uploadErr } = await uploadAvatar(
          userId,
          avatarLocalUri,
          avatarMime,
          avatarBase64,
        );
        if (uploadErr || !publicUrl) {
          setAvatarError(true);
          return;
        }
        const { error: avatarErr } = await setOwnAvatar(publicUrl);
        if (avatarErr) {
          setAvatarError(true);
          return;
        }
        setAvatarUrl(publicUrl);
        setAvatarLocalUri(null);
        setAvatarBase64(null);
      }

      const { result } = await updateProfile({
        show_birth_year: showBirthYear,
        gender,
        city: city.trim() || null,
        bio: bio.trim() || null,
        sports,
      });

      if (result !== 'ok') {
        setSaveError(true);
        return;
      }
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('profile.editProfile')}
        onBack={() => goBack('/profile')}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 24, paddingHorizontal: 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={Brand.primary} style={styles.loader} />
        ) : loadError ? (
          <Text style={styles.errorText}>{t('profile.loadError')}</Text>
        ) : (
          <View style={styles.form}>
            <View style={styles.avatarBlock}>
              <Pressable onPress={() => void handlePickAvatar()} disabled={saving} hitSlop={8}>
                <UserAvatar
                  nick={nick}
                  avatarUrl={avatarLocalUri ?? avatarUrl}
                  size={96}
                />
                <View style={styles.avatarEditBadge}>
                  <Text style={styles.avatarEditIcon}>✎</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => void handlePickAvatar()} disabled={saving} hitSlop={8}>
                <Text style={styles.avatarHint}>{t('profile.changeAvatar')}</Text>
              </Pressable>
            </View>

            <View style={styles.nickCard}>
              <Text style={styles.nickLabel}>{t('common.nick')}</Text>
              <Text style={styles.nickValue}>{nick || '—'}</Text>
              <Text style={styles.hint}>{t('profile.nickLocked')}</Text>
            </View>

            {birthYear !== null && (
              <View style={styles.rowBetween}>
                <Text style={styles.rowLabel}>
                  {t('profile.birthYear')}: {birthYear}
                </Text>
              </View>
            )}

            <View style={styles.rowBetween}>
              <Text style={styles.rowLabel}>{t('profile.showBirthYear')}</Text>
              <Switch
                value={showBirthYear}
                onValueChange={setShowBirthYear}
                disabled={saving}
                trackColor={{ true: Brand.primary }}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>{t('profile.gender')}</Text>
              <View style={styles.segmented}>
                {GENDER_OPTIONS.map((option) => {
                  const selected = gender === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      onPress={() => setGender(option.value)}
                      disabled={saving}
                      style={[styles.segment, selected && styles.segmentSelected]}>
                      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {countryCode ? (
              <View style={styles.nickCard}>
                <Text style={styles.nickLabel}>{t('profile.country')}</Text>
                <Text style={styles.nickValue}>
                  {countryCodeToFlag(countryCode)} {countryName(countryCode) ?? countryCode}
                </Text>
                <Text style={styles.hint}>{t('profile.countryLocked')}</Text>
              </View>
            ) : null}

            <TextField
              label={t('profile.city')}
              value={city}
              onChangeText={setCity}
              placeholder={t('profile.cityPlaceholder')}
              maxLength={80}
              editable={!saving}
            />

            <View>
              <TextField
                label={t('profile.bioLabel')}
                value={bio}
                onChangeText={(text) => setBio(text.slice(0, BIO_MAX))}
                placeholder={t('profile.bioPlaceholder')}
                maxLength={BIO_MAX}
                multiline
                editable={!saving}
                style={styles.bioInput}
              />
              <View style={styles.bioMetaRow}>
                <Text style={styles.hint}>{t('profile.bioHint')}</Text>
                <Text style={styles.bioCounter}>
                  {bio.trim().length}/{BIO_MAX}
                </Text>
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>{t('profile.interestsLabel')}</Text>
              <Text style={styles.interestsHint}>{t('profile.interestsHint')}</Text>
              <View style={styles.segmented}>
                {INTEREST_SPORTS.map((sport) => {
                  const selected = sports.includes(sport.id);
                  return (
                    <Pressable
                      key={sport.id}
                      onPress={() =>
                        setSports((prev) =>
                          prev.includes(sport.id)
                            ? prev.filter((s) => s !== sport.id)
                            : [...prev, sport.id],
                        )
                      }
                      disabled={saving}
                      style={[styles.segment, selected && styles.segmentSelected]}>
                      <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                        {markerEmoji('sport', sport.id)} {sport.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {avatarError && (
              <Text style={styles.errorText}>{t('profile.avatarUploadFailed')}</Text>
            )}
            {saveError && <Text style={styles.errorText}>{t('profile.saveError')}</Text>}
            {saved && <Text style={styles.savedText}>{t('profile.saved')}</Text>}

            <Button
              label={saving ? t('profile.saving') : t('profile.save')}
              onPress={handleSave}
              disabled={saving}
              style={styles.save}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  content: {
    flexGrow: 1,
    paddingTop: 8,
  },
  loader: {
    marginTop: 32,
  },
  form: {
    gap: 20,
  },
  avatarBlock: {
    alignItems: 'center',
    gap: 8,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Brand.screenBackground,
  },
  avatarEditIcon: {
    color: Brand.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  avatarHint: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.primary,
  },
  nickCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    gap: 4,
  },
  nickLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  nickValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  hint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 16,
    color: Brand.textPrimary,
    flex: 1,
    paddingRight: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textSecondary,
    marginBottom: 10,
  },
  interestsHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: -4,
    marginBottom: 10,
  },
  bioInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  bioMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  bioCounter: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 6,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  segmentSelected: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  segmentText: {
    fontSize: 14,
    color: Brand.textPrimary,
  },
  segmentTextSelected: {
    color: Brand.primaryText,
    fontWeight: '600',
  },
  countryRow: {
    gap: 8,
    paddingVertical: 4,
  },
  countryChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  countryChipText: {
    fontSize: 14,
    color: Brand.textPrimary,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
  },
  savedText: {
    fontSize: 14,
    color: Brand.primary,
  },
  save: {
    marginTop: 8,
  },
});

