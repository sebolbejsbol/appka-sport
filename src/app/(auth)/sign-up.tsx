import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';

import { Button } from '@/components/button';
import { LegalFooterLinks } from '@/components/legal-footer-links';
import { ScreenHeader } from '@/components/screen-header';
import { TextField } from '@/components/text-field';
import { Brand, Radius } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { useLocale } from '@/context/locale';
import { t, SUPPORTED_LOCALES, type Locale, type TKey } from '@/i18n';
import { mapAuthError } from '@/lib/auth-errors';
import { PROFILE_COUNTRIES, countryCodeToFlag, countryLabel } from '@/lib/countries';
import { markerEmoji, subcategoriesFor } from '@/lib/event-categories';
import { openLegalDocument } from '@/lib/legal-navigation';
import { goBack } from '@/lib/navigation';
import { isNickAvailable } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';
import { validateBirthYear, validateEmail, validateNick, validatePassword } from '@/lib/validation';

type StepId = 'language' | 'account' | 'profile' | 'sports';

const STEPS: StepId[] = ['language', 'account', 'profile', 'sports'];

const STEP_HEADERS: Record<StepId, { title: TKey; subtitle: TKey }> = {
  language: { title: 'signUp.step1Title', subtitle: 'signUp.step1Subtitle' },
  account: { title: 'signUp.step2Title', subtitle: 'signUp.step2Subtitle' },
  profile: { title: 'signUp.step3Title', subtitle: 'signUp.step3Subtitle' },
  sports: { title: 'signUp.step4Title', subtitle: 'signUp.step4Subtitle' },
};

type FormErrors = {
  nick?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  birthYear?: string;
  country?: string;
  consent?: string;
};

const INTEREST_SPORTS = subcategoriesFor('sport');

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const { locale, setLocale } = useLocale();

  const [stepId, setStepId] = useState<StepId>('language');
  const [language, setLanguage] = useState<Locale>(locale);
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [countryCode, setCountryCode] = useState('PL');
  const [sports, setSports] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const stepIndex = STEPS.indexOf(stepId);
  const totalSteps = STEPS.length;
  const isLastStep = stepIndex === totalSteps - 1;
  const header = STEP_HEADERS[stepId];

  const nickError = useMemo(() => validateNick(nick), [nick]);

  function validateStep(id: StepId): FormErrors {
    if (id === 'account') {
      return {
        email: validateEmail(email),
        password: validatePassword(password),
        confirmPassword:
          password !== confirmPassword ? t('errors.passwordMismatch') : undefined,
      };
    }
    if (id === 'profile') {
      return {
        nick: validateNick(nick),
        birthYear: validateBirthYear(birthYear),
        country: countryCode ? undefined : t('signUp.countryRequired'),
      };
    }
    if (id === 'sports') {
      return { consent: consent ? undefined : t('errors.consentRequired') };
    }
    return {};
  }

  function goToPrevStep() {
    setFormError(undefined);
    if (stepIndex <= 0) {
      goBack('/');
      return;
    }
    setStepId(STEPS[stepIndex - 1]);
  }

  async function goToNextStep() {
    setFormError(undefined);
    const stepErrors = validateStep(stepId);
    setErrors(stepErrors);
    if (Object.values(stepErrors).some(Boolean)) return;

    // Sprawdzenie dostępności nicku przy opuszczaniu kroku profilu (zanim dojdziemy do rejestracji).
    if (stepId === 'profile') {
      setSubmitting(true);
      const available = await isNickAvailable(nick.trim());
      setSubmitting(false);
      if (!available) {
        setErrors((prev) => ({ ...prev, nick: t('errors.nickTaken') }));
        return;
      }
    }

    if (isLastStep) {
      await handleSubmit();
      return;
    }
    setStepId(STEPS[stepIndex + 1]);
  }

  async function handleSubmit() {
    // Ostateczna walidacja wszystkich kroków przed wysłaniem.
    const allErrors: FormErrors = {
      ...validateStep('account'),
      ...validateStep('profile'),
      ...validateStep('sports'),
    };
    setErrors(allErrors);
    if (Object.values(allErrors).some(Boolean)) {
      // Cofnij do pierwszego kroku z błędem.
      if (allErrors.email || allErrors.password || allErrors.confirmPassword) setStepId('account');
      else if (allErrors.nick || allErrors.birthYear || allErrors.country) setStepId('profile');
      return;
    }

    setSubmitting(true);
    setFormError(undefined);

    const nickAvailable = await isNickAvailable(nick.trim());
    if (!nickAvailable) {
      setSubmitting(false);
      setStepId('profile');
      setErrors((prev) => ({ ...prev, nick: t('errors.nickTaken') }));
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          nick: nick.trim(),
          birth_year: Number(birthYear),
          country_code: countryCode,
          sports,
          language,
        },
      },
    });
    setSubmitting(false);

    if (error) {
      setFormError(mapAuthError(error));
      return;
    }

    void setLocale(language);

    // Jedno konto na e-mail: gdy adres już istnieje, Supabase zwraca użytkownika
    // bez tożsamości (pusta tablica identities) zamiast błędu.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setStepId('account');
      setErrors((prev) => ({ ...prev, email: t('errors.emailTaken') }));
      return;
    }

    // Gdy potwierdzanie e-mail jest wyłączone, sesja powstaje od razu i SessionProvider
    // przekieruje do (app). Gdy jest włączone — pokazujemy ekran „sprawdź skrzynkę".
    if (!data.session) {
      setRegistered(true);
    }
  }

  if (registered) {
    return (
      <View
        style={[
          styles.successContainer,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}>
        <View style={styles.successHeader}>
          <Text style={styles.successTitle}>{t('signUp.emailSentTitle')}</Text>
          <Text style={styles.successBody}>{t('signUp.emailSentBody')}</Text>
        </View>
        <Button label={t('signUp.backToLogin')} onPress={() => router.replace('/sign-in')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader insetTop={insets.top} onBack={goToPrevStep} />

      <View style={styles.progressHeader}>
        <Text style={styles.stepCounter}>
          {t('signUp.stepOf')
            .replace('{current}', String(stepIndex + 1))
            .replace('{total}', String(totalSteps))}
        </Text>
        <View style={styles.progressTrack}>
          {STEPS.map((id, i) => (
            <View
              key={id}
              style={[styles.progressSeg, i <= stepIndex && styles.progressSegActive]}
            />
          ))}
        </View>
        <Text style={styles.title}>{t(header.title)}</Text>
        <Text style={styles.subtitle}>{t(header.subtitle)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled">
        <Animated.View key={stepId} entering={FadeInRight.duration(260)}>
        {stepId === 'language' ? (
          <View style={styles.form}>
            <View>
              <Text style={styles.fieldLabel}>{t('signUp.language')}</Text>
              <Text style={styles.hint}>{t('signUp.languageHint')}</Text>
              <View style={styles.sportsRow}>
                {SUPPORTED_LOCALES.map((option) => {
                  const selected = language === option.code;
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => {
                        setLanguage(option.code);
                        void setLocale(option.code);
                      }}
                      disabled={submitting}
                      style={[styles.countryChip, selected && styles.countryChipSelected]}>
                      <Text
                        style={[styles.countryChipText, selected && styles.countryChipTextSelected]}>
                        {option.flag} {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : null}

        {stepId === 'account' ? (
          <View style={styles.form}>
            <TextField
              label={t('common.email')}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              editable={!submitting}
            />
            <TextField
              label={t('common.password')}
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              passwordToggle
              autoComplete="password-new"
              textContentType="newPassword"
              placeholder={t('signUp.passwordPlaceholder')}
              editable={!submitting}
            />
            <TextField
              label={t('signUp.confirmPassword')}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              error={errors.confirmPassword}
              passwordToggle
              autoComplete="password-new"
              textContentType="newPassword"
              placeholder={t('signUp.confirmPasswordPlaceholder')}
              editable={!submitting}
            />
          </View>
        ) : null}

        {stepId === 'profile' ? (
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
              {!errors.nick && <Text style={styles.hint}>{t('profile.nickHint')}</Text>}
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
              {!!errors.country && <Text style={styles.errorText}>{errors.country}</Text>}
            </View>
          </View>
        ) : null}

        {stepId === 'sports' ? (
          <View style={styles.form}>
            <View>
              <Text style={styles.fieldLabel}>{t('signUp.interests')}</Text>
              <Text style={styles.hint}>{t('signUp.interestsHint')}</Text>
              <View style={styles.sportsRow}>
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
                      disabled={submitting}
                      style={[styles.countryChip, selected && styles.countryChipSelected]}>
                      <Text
                        style={[styles.countryChipText, selected && styles.countryChipTextSelected]}>
                        {markerEmoji('sport', sport.id)} {sport.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <View style={styles.consentRow}>
                <Pressable
                  onPress={() => setConsent((value) => !value)}
                  disabled={submitting}
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}>
                  <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
                    {consent && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                </Pressable>
                <Text style={styles.consentText}>
                  {t('signUp.consentPrefix')}{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => openLegalDocument('terms', '/sign-up')}
                    suppressHighlighting>
                    {t('signUp.consentTermsLink')}
                  </Text>{' '}
                  {t('signUp.consentMiddle')}{' '}
                  <Text
                    style={styles.consentLink}
                    onPress={() => openLegalDocument('privacy', '/sign-up')}
                    suppressHighlighting>
                    {t('signUp.consentPrivacyLink')}
                  </Text>
                </Text>
              </View>
              {!!errors.consent && <Text style={styles.errorText}>{errors.consent}</Text>}
            </View>
          </View>
        ) : null}

        </Animated.View>

        {!!formError && (
          <Animated.Text entering={FadeIn} style={[styles.errorText, styles.formError]}>
            {formError}
          </Animated.Text>
        )}

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>{t('signUp.haveAccount')} </Text>
          <Pressable onPress={() => router.replace('/sign-in')} hitSlop={8} disabled={submitting}>
            <Text style={styles.switchLink}>{t('signUp.goLogin')}</Text>
          </Pressable>
        </View>

        <LegalFooterLinks style={styles.legalFooter} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label={
            submitting
              ? isLastStep
                ? t('signUp.creating')
                : t('common.loading')
              : isLastStep
                ? t('signUp.finish')
                : t('signUp.next')
          }
          onPress={goToNextStep}
          disabled={submitting || (stepId === 'profile' && !!nickError && nick.length === 0)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  progressHeader: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
  },
  stepCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textMuted,
    marginBottom: 10,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 18,
  },
  progressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: Brand.border,
  },
  progressSegActive: {
    backgroundColor: Brand.primary,
  },
  title: {
    ...Typography.screenTitle,
    marginBottom: 6,
  },
  subtitle: {
    ...Typography.bodySecondary,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
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
    marginBottom: 6,
  },
  hint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 6,
    marginBottom: 8,
  },
  countryRow: {
    gap: 8,
    paddingVertical: 4,
  },
  sportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  checkboxMark: {
    color: Brand.primaryText,
    fontSize: 15,
    fontWeight: '700',
  },
  consentText: {
    flex: 1,
    fontSize: 15,
    color: Brand.textSecondary,
    lineHeight: 22,
  },
  consentLink: {
    color: Brand.textMuted,
    textDecorationLine: 'underline',
  },
  errorText: {
    fontSize: 13,
    color: Brand.danger,
    marginTop: 6,
  },
  formError: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  switchText: {
    fontSize: 15,
    color: Brand.textSecondary,
  },
  switchLink: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.primary,
  },
  legalFooter: {
    marginTop: 28,
    marginBottom: 8,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    backgroundColor: Brand.surface,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  successContainer: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  successHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 16,
    color: Brand.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
