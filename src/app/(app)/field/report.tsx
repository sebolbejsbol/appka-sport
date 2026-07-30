import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import {
  FieldReportLocationPicker,
  type FieldReportLocation,
} from '@/components/field-report-map-picker';
import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { submitFieldReport } from '@/lib/field-reports';
import { goBack } from '@/lib/navigation';
import {
  MAX_FIELD_NAME_CHARS,
  MAX_FIELD_NOTE_CHARS,
  validateFieldName,
  validateFieldNote,
} from '@/lib/validation';

function parseCoord(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export default function ReportFieldScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lng?: string; lat?: string }>();

  const paramLng = parseCoord(params.lng);
  const paramLat = parseCoord(params.lat);

  const [location, setLocation] = useState<FieldReportLocation | null>(
    paramLng != null && paramLat != null ? { lng: paramLng, lat: paramLat } : null,
  );

  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [noteError, setNoteError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function openOnMap() {
    if (!location) return;
    const url = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    void Linking.openURL(url);
  }

  async function handleSubmit() {
    if (!location) {
      setSubmitError(t('fieldReport.errors.noLocation'));
      return;
    }

    const nextNameError = validateFieldName(name);
    const nextNoteError = validateFieldNote(note);
    setNameError(nextNameError);
    setNoteError(nextNoteError);
    setSubmitError(undefined);

    if (nextNameError || nextNoteError) return;

    setSubmitting(true);
    const result = await submitFieldReport({
      lng: location.lng,
      lat: location.lat,
      name,
      note,
    });
    setSubmitting(false);

    if (result.ok) {
      setSubmitted(true);
      return;
    }

    if (result.reason === 'too_close') {
      setSubmitError(t('fieldReport.errors.tooClose'));
      return;
    }
    if (result.reason === 'rate_limit') {
      setSubmitError(t('fieldReport.errors.rateLimit'));
      return;
    }
    if (result.reason === 'migration_missing') {
      setSubmitError(t('fieldReport.errors.migrationMissing'));
      return;
    }
    if (result.reason === 'not_authenticated') {
      setSubmitError(t('fieldReport.errors.notAuthenticated'));
      return;
    }
    if (result.reason === 'invalid_input') {
      setSubmitError(t('fieldReport.errors.invalidInput'));
      return;
    }
    setSubmitError(t('fieldReport.errors.submitFailed'));
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => goBack('/settings')} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('fieldReport.title')}</Text>
        <Text style={styles.hint}>{t('fieldReport.hint')}</Text>

        {submitted ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>{t('fieldReport.successTitle')}</Text>
            <Text style={styles.successBody}>{t('fieldReport.successBody')}</Text>
            <Button label={t('common.back')} onPress={() => goBack('/settings')} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>{t('fieldReport.pickLocationTitle')}</Text>
            <Text style={styles.sectionHint}>{t('fieldReport.pickLocationHint')}</Text>

            <FieldReportLocationPicker value={location} onChange={setLocation} />

            {location ? (
              <Pressable onPress={openOnMap} hitSlop={8}>
                <Text style={styles.mapLink}>{t('fieldReport.openMap')} ›</Text>
              </Pressable>
            ) : null}

            <Text style={styles.sectionTitle}>{t('fieldReport.detailsTitle')}</Text>

            <TextField
              label={t('fieldReport.nameLabel')}
              value={name}
              onChangeText={setName}
              error={nameError}
              placeholder={t('fieldReport.namePlaceholder')}
              maxLength={MAX_FIELD_NAME_CHARS}
              editable={!submitting}
            />
            <Text style={styles.fieldHint}>{t('fieldReport.nameHint')}</Text>

            <TextField
              label={t('fieldReport.noteLabel')}
              value={note}
              onChangeText={setNote}
              error={noteError}
              placeholder={t('fieldReport.notePlaceholder')}
              maxLength={MAX_FIELD_NOTE_CHARS}
              multiline
              editable={!submitting}
            />

            {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

            <Button
              label={submitting ? t('fieldReport.submitting') : t('fieldReport.submit')}
              onPress={handleSubmit}
              disabled={submitting || !location}
              style={styles.submit}
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
    paddingHorizontal: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 20,
  },
  form: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginBottom: 4,
  },
  mapLink: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: -4,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
  },
  submit: {
    marginTop: 8,
  },
  successCard: {
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  successBody: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginBottom: 8,
  },
});
