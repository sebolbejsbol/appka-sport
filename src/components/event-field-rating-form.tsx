import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FieldRatingStars } from '@/components/field-rating-stars';
import { Brand, BrandFonts } from '@/constants/theme';
import { t } from '@/i18n';
import {
  emptyFieldRatingScores,
  FIELD_RATING_DIMENSIONS,
  isFieldRatingComplete,
  submitFieldRating,
  type EventFieldRating,
  type FieldRatingDimension,
  type FieldRatingScores,
} from '@/lib/field-ratings';
import { requestMapFieldsRefresh } from '@/lib/map-field-sync';
import { notifyError } from '@/lib/toast';

type Props = {
  eventId: string;
  initialRating: EventFieldRating | null;
  onSubmitted: () => void;
  embedded?: boolean;
};

export function EventFieldRatingForm({
  eventId,
  initialRating,
  onSubmitted,
  embedded = false,
}: Props) {
  const [draft, setDraft] = useState<FieldRatingScores>(emptyFieldRatingScores());
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialRating) {
      setDraft({
        surface: initialRating.surface_score,
        lighting: initialRating.lighting_score,
        cleanliness: initialRating.cleanliness_score,
        accessibility: initialRating.accessibility_score,
        safety: initialRating.safety_score,
      });
      setComment(initialRating.comment ?? '');
    } else {
      setDraft(emptyFieldRatingScores());
      setComment('');
    }
  }, [eventId, initialRating]);

  function setDimensionScore(dimension: FieldRatingDimension, value: number) {
    setDraft((prev) => ({ ...prev, [dimension]: value }));
  }

  async function handleSubmit() {
    if (!isFieldRatingComplete(draft)) {
      notifyError(t('fieldRatings.errors.incomplete'));
      return;
    }

    setSubmitting(true);
    const result = await submitFieldRating(eventId, draft, comment.trim() || null);
    setSubmitting(false);

    if (!result.ok) {
      const message =
        result.error === 'not_rateable'
          ? t('fieldRatings.errors.notRateable')
          : result.error === 'invalid_comment'
            ? t('fieldRatings.errors.invalidComment')
            : t('fieldRatings.errors.submitFailed');
      notifyError(message);
      return;
    }

    requestMapFieldsRefresh();
    onSubmitted();
  }

  return (
    <View style={embedded ? styles.embedded : styles.card}>
      {!embedded ? (
        <>
          <Text style={styles.title}>{t('fieldRatings.rateAfterEvent')}</Text>
          <Text style={styles.hint}>{t('fieldRatings.rateAfterEventHint')}</Text>
        </>
      ) : null}

      {FIELD_RATING_DIMENSIONS.map((dimension) => (
        <View key={dimension} style={styles.formRow}>
          <Text style={styles.formLabel}>{t(`fieldRatings.dimensions.${dimension}`)}</Text>
          <FieldRatingStars
            value={draft[dimension]}
            onChange={(value) => setDimensionScore(dimension, value)}
          />
        </View>
      ))}

      <TextInput
        style={styles.commentInput}
        value={comment}
        onChangeText={setComment}
        placeholder={t('fieldRatings.commentPlaceholder')}
        placeholderTextColor={Brand.textMuted}
        multiline
        maxLength={500}
      />

      <Pressable
        style={({ pressed }) => [
          styles.submitBtn,
          (pressed || submitting) && styles.pressed,
          submitting && styles.disabled,
        ]}
        onPress={() => void handleSubmit()}
        disabled={submitting}>
        <Text style={styles.submitBtnText}>
          {submitting ? t('fieldRatings.submitting') : t('fieldRatings.submit')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.screenBackground,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: BrandFonts.bodyBold,
    color: Brand.textPrimary,
  },
  hint: {
    fontSize: 13,
    fontFamily: BrandFonts.body,
    color: Brand.textSecondary,
    marginBottom: 4,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  formLabel: {
    fontSize: 14,
    fontFamily: BrandFonts.body,
    color: Brand.textSecondary,
    flex: 1,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: BrandFonts.body,
    color: Brand.textPrimary,
    backgroundColor: Brand.surface,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: Brand.primary,
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.primaryText,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.6,
  },
  embedded: {
    gap: 10,
  },
});
