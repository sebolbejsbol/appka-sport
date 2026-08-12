import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventMetaFields } from '@/components/event-meta-fields';
import { Button } from '@/components/button';
import { DatePickerField } from '@/components/date-picker-field';
import { TimePickerField } from '@/components/time-picker-field';
import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { parseLocalDateTime, toDateInput, toTimeInput } from '@/lib/datetime';
import { getEventDetail, updateEvent } from '@/lib/events';
import { mapEventMutationError } from '@/lib/event-errors';
import type { EventType, PaymentStatus, SkillLevel } from '@/lib/event-filters';
import { formatCourtName } from '@/lib/field-display';
import { goBack } from '@/lib/navigation';
import {
  countWords,
  enforceEventTextLimit,
  MAX_EVENT_NOTES_CHARS,
  MAX_EVENT_NOTES_WORDS,
  MAX_EVENT_TITLE_CHARS,
  MAX_EVENT_TITLE_WORDS,
  validateEventNotes,
  validateEventTitle,
} from '@/lib/validation';

const DURATION_OPTIONS = [60, 90, 120, 180];

function parseDurationMinutes(preset: number, custom: string): number | null {
  if (custom.trim()) {
    const parsed = Number(custom.trim());
    if (!Number.isInteger(parsed) || parsed < 15 || parsed > 600) return null;
    return parsed;
  }
  return preset;
}

function presetFromDuration(minutes: number): { preset: number; custom: string } {
  if (DURATION_OPTIONS.includes(minutes)) {
    return { preset: minutes, custom: '' };
  }
  return { preset: 90, custom: String(minutes) };
}

export default function EditEventScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = params.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [courtName, setCourtName] = useState('');

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(90);
  const [customDuration, setCustomDuration] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('any');
  const [eventType, setEventType] = useState<EventType>('match');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('free');
  const [visibility, setVisibility] = useState<'public' | 'friends_only'>('public');

  const [errors, setErrors] = useState<{
    date?: string;
    time?: string;
    max?: string;
    duration?: string;
    title?: string;
    notes?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    getEventDetail(eventId).then(({ data, error }) => {
      if (error || !data || !data.can_manage) {
        setLoadError(true);
        setLoading(false);
        return;
      }

      const start = new Date(data.starts_at);
      setCourtName(formatCourtName(data.field_name));
      setDate(toDateInput(start));
      setTime(toTimeInput(start));
      const dur = presetFromDuration(data.duration_min);
      setDuration(dur.preset);
      setCustomDuration(dur.custom);
      setMaxPlayers(data.max_players != null ? String(data.max_players) : '');
      setTitle(data.title ?? '');
      setNotes(data.notes ?? '');
      setSkillLevel(data.skill_level);
      setEventType(data.event_type);
      setPaymentStatus(data.payment_status);
      setVisibility(data.visibility);
      setLoading(false);
    });
  }, [eventId]);

  async function handleSave() {
    if (!eventId) return;

    const nextErrors: typeof errors = {};
    const iso = parseLocalDateTime(date, time);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      nextErrors.date = t('event.errors.dateInvalid');
    }
    if (!/^\d{1,2}:\d{2}$/.test(time.trim())) {
      nextErrors.time = t('event.errors.timeInvalid');
    }

    let maxPlayersValue: number | null = null;
    if (maxPlayers.trim()) {
      const parsed = Number(maxPlayers.trim());
      if (!Number.isInteger(parsed) || parsed < 2 || parsed > 100) {
        nextErrors.max = t('event.errors.maxPlayersInvalid');
      } else {
        maxPlayersValue = parsed;
      }
    }

    const durationMin = parseDurationMinutes(duration, customDuration);
    if (durationMin == null) {
      nextErrors.duration = t('event.errors.durationInvalid');
    }

    const titleError = validateEventTitle(title);
    if (titleError) nextErrors.title = titleError;

    const notesError = validateEventNotes(notes);
    if (notesError) nextErrors.notes = notesError;

    setErrors(nextErrors);
    setSubmitError(undefined);
    if (Object.keys(nextErrors).length > 0 || !iso || durationMin == null) return;

    setSubmitting(true);
    const { error } = await updateEvent(eventId, {
      starts_at: iso,
      duration_min: durationMin,
      max_players: maxPlayersValue,
      title: title.trim() || null,
      notes: notes.trim() || null,
      skill_level: skillLevel,
      event_type: eventType,
      payment_status: paymentStatus,
      visibility,
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(mapEventMutationError(error, 'update'));
      return;
    }

    goBack(`/event/${eventId}`);
  }

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Brand.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Text style={styles.errorText}>{t('event.loadError')}</Text>
        <Pressable onPress={() => goBack('/')} style={styles.backLink}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
      </View>
    );
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
        <Pressable
          onPress={() => goBack(eventId ? `/event/${eventId}` : '/')}
          hitSlop={12}
          style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>

        <Text style={styles.title}>{t('event.editTitle')}</Text>

        <View style={styles.courtBadge}>
          <Text style={styles.courtLabel}>{t('event.atCourt')}</Text>
          <Text style={styles.courtName}>{courtName}</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.rowFields}>
            <View style={styles.flexField}>
              <Text style={styles.fieldLabel}>{t('event.dateLabel')}</Text>
              <DatePickerField label={t('event.dateLabel')} value={date} onChange={setDate} />
            </View>
            <View style={styles.flexField}>
              <Text style={styles.fieldLabel}>{t('event.timeLabel')}</Text>
              <TimePickerField label={t('event.timeLabel')} value={time} onChange={setTime} />
            </View>
          </View>

          <View>
            <Text style={styles.fieldLabel}>{t('event.durationLabel')}</Text>
            <View style={styles.segmented}>
              {DURATION_OPTIONS.map((option) => {
                const selected = !customDuration.trim() && duration === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      setDuration(option);
                      setCustomDuration('');
                    }}
                    disabled={submitting}
                    style={[styles.segment, selected && styles.segmentSelected]}>
                    <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
                      {option} {t('event.durationShort')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.customDuration}>
              <TextField
                label={t('event.durationCustomLabel')}
                value={customDuration}
                onChangeText={setCustomDuration}
                placeholder={t('event.durationCustomPlaceholder')}
                keyboardType="number-pad"
                error={errors.duration}
                editable={!submitting}
              />
            </View>
          </View>

          <TextField
            label={t('event.maxPlayersLabel')}
            value={maxPlayers}
            onChangeText={setMaxPlayers}
            placeholder={t('event.maxPlayersPlaceholder')}
            keyboardType="number-pad"
            error={errors.max}
            editable={!submitting}
          />

          <EventMetaFields
            skillLevel={skillLevel}
            eventType={eventType}
            paymentStatus={paymentStatus}
            visibility={visibility}
            onSkillLevel={setSkillLevel}
            onEventType={setEventType}
            onPaymentStatus={setPaymentStatus}
            onVisibility={setVisibility}
            disabled={submitting}
          />

          <View>
            <TextField
              label={t('event.titleLabel')}
              value={title}
              onChangeText={(text) =>
                setTitle(
                  enforceEventTextLimit(text, {
                    maxWords: MAX_EVENT_TITLE_WORDS,
                    maxChars: MAX_EVENT_TITLE_CHARS,
                  }),
                )
              }
              placeholder={t('event.titlePlaceholder')}
              maxLength={MAX_EVENT_TITLE_CHARS}
              error={errors.title}
              editable={!submitting}
            />
            <Text style={styles.hint}>
              {countWords(title)}/{MAX_EVENT_TITLE_WORDS} {t('event.wordCount')} ·{' '}
              {t('event.titleHint')}
            </Text>
          </View>

          <View>
            <TextField
              label={t('event.notesLabel')}
              value={notes}
              onChangeText={(text) =>
                setNotes(
                  enforceEventTextLimit(text, {
                    maxWords: MAX_EVENT_NOTES_WORDS,
                    maxChars: MAX_EVENT_NOTES_CHARS,
                  }),
                )
              }
              placeholder={t('event.notesPlaceholder')}
              maxLength={MAX_EVENT_NOTES_CHARS}
              multiline
              error={errors.notes}
              editable={!submitting}
            />
            <Text style={styles.hint}>
              {countWords(notes)}/{MAX_EVENT_NOTES_WORDS} {t('event.wordCount')} ·{' '}
              {t('event.notesHint')}
            </Text>
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <Button
            label={submitting ? t('event.saving') : t('event.saveChanges')}
            onPress={handleSave}
            disabled={submitting}
            style={styles.submit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  centered: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backLink: {
    marginTop: 16,
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
    marginBottom: 16,
  },
  courtBadge: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  courtLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  courtName: {
    fontSize: 16,
    color: Brand.textPrimary,
  },
  form: {
    gap: 20,
  },
  rowFields: {
    flexDirection: 'row',
    gap: 12,
  },
  flexField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textSecondary,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customDuration: {
    marginTop: 12,
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
  errorText: {
    fontSize: 14,
    color: Brand.danger,
  },
  hint: {
    fontSize: 13,
    color: Brand.textMuted,
    marginTop: 6,
  },
  submit: {
    marginTop: 8,
  },
});
