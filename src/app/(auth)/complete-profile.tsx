import { useState } from 'react';
import {
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
import { TextField } from '@/components/text-field';
import { Brand, Radius } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { countryCodeToFlag, countryLabel, PROFILE_COUNTRIES } from '@/lib/countries';
import { claimProfileBasics, isNickAvailable } from '@/lib/profiles';
import { validateBirthYear, validateNick } from '@/lib/validation';

type FormErrors = {
  nick?: string;
  birthYear?: string;
};

/**
 * Ekran „dokończ profil" — pokazuje się TYLKO gdy profil nie ma jeszcze nicku
 * (typowo od razu po pierwszym logowaniu przez Google/Facebook/Apple, bo ci
 * dostawcy nie przekazują nicku/roku urodzenia). Gating: src/context/session.tsx
 * + src/app/_layout.tsx (needsProfileSetup).
 */
export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const { markProfileComplete, signOut } = useSession();

  const [nick, setNick] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [countryCode, setCountryCode] = useState('PL');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const nextErrors: FormErrors = {
      nick: validateNick(nick),
      birthYear: validateBirthYear(birthYear),
    };
    setErrors(nextErrors);
    setFormError(undefined);
    if (nextErrors.nick || nextErrors.birthYear) return;

    setSubmitting(true);

    const available = await isNickAvailable(nick.trim());
    if (!available) {
      setSubmitting(false);
      setErrors((prev) => ({ ...prev, nick: t('errors.nickTaken') }));
      return;
    }

    const { result } = await claimProfileBasics(
      nick.trim(),
      Number(birthYear),
      countryCode,
    );
    setSubmitting(false);

    if (result === 'ok') {
      markProfileComplete();
      return;
    }
    if (result === 'nick_taken' || result === 'invalid_nick') {
      setErrors((prev) => ({ ...prev, nick: t('errors.nickTaken') }));
      return;
    }
    setFormError(t('completeProfile.genericError'));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('completeProfile.title')}</Text>
        <Text style={styles.lead}>{t('completeProfile.lead')}</Text>

        <View style={styles.form}>
          <View>
            <TextField
              label={t('common.nick')}
              value={nick}
              onChangeText={setNick}
              error={errors.nick}
              autoCapitalize="none"
              maxLength={24}
              placeholder={t('signUp.nickPlaceholder')}
              editable={!submitting}
            />
            {!errors.nick && <Text style={styles.hint}>{t('completeProfile.nickHint')}</Text>}
          </View>

          <View>
            <TextField
              label={t('signUp.birthYear')}
              value={birthYear}
              onChangeText={setBirthYear}
              error={errors.birthYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="1998"
              editable={!submitting}
            />
            {!errors.birthYear && <Text style={styles.hint}>{t('signUp.birthYearHint')}</Text>}
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('signUp.country')}</Text>
            <Text style={styles.hint}>{t('signUp.countryHint')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.countryRow}>
              {PROFILE_COUNTRIES.map((country) => {
                const selected = countryCode === country.code;
                return (
                  <Pressable
                    key={country.code}
                    onPress={() => setCountryCode(country.code)}
                    disabled={submitting}
                    style={[styles.countryChip, selected && styles.countryChipSelected]}>
                    <Text
                      style={[styles.countryChipText, selected && styles.countryChipTextSelected]}>
                      {countryCodeToFlag(country.code)} {countryLabel(country.code)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {!!formError && <Text style={styles.formError}>{formError}</Text>}

          <Button
            label={submitting ? t('common.loading') : t('completeProfile.submit')}
            onPress={handleSubmit}
            disabled={submitting}
            style={styles.submit}
          />
        </View>

        <Pressable
          onPress={() => void signOut()}
          hitSlop={8}
          disabled={submitting}
          style={styles.signOutRow}>
          <Text style={styles.signOutText}>{t('settings.signOut')}</Text>
        </Pressable>
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
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  title: {
    ...Typography.screenTitle,
    marginBottom: 8,
  },
  lead: {
    ...Typography.bodySecondary,
    marginBottom: 28,
  },
  form: {
    gap: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  hint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 6,
  },
  countryRow: {
    gap: 8,
    paddingVertical: 4,
    marginTop: 8,
  },
  countryChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  countryChipSelected: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  countryChipText: {
    fontSize: 14,
    color: Brand.textPrimary,
  },
  countryChipTextSelected: {
    color: Brand.primaryText,
    fontWeight: '600',
  },
  formError: {
    fontSize: 14,
    color: Brand.danger,
    fontWeight: '500',
  },
  submit: {
    marginTop: 4,
  },
  signOutRow: {
    alignSelf: 'center',
    marginTop: 32,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textMuted,
    textDecorationLine: 'underline',
  },
});
