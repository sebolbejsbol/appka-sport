import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldRatingStars } from '@/components/field-rating-stars';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import {
  FIELD_RATING_DIMENSIONS,
  getFieldRatingSummary,
  listFieldRatings,
  overallFromScores,
  type FieldRatingReview,
  type FieldRatingSummary,
} from '@/lib/field-ratings';
import { formatRatingCount } from '@/lib/plural-pl';

type Props = {
  fieldId: string | null;
  visible: boolean;
  onClose: () => void;
};

export function FieldOpinionsSheet({ fieldId, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<FieldRatingSummary | null>(null);
  const [reviews, setReviews] = useState<FieldRatingReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!fieldId) return;
    setLoading(true);
    setLoadError(false);
    const [summaryRes, reviewsRes] = await Promise.all([
      getFieldRatingSummary(fieldId),
      listFieldRatings(fieldId),
    ]);
    if (summaryRes.error || reviewsRes.error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setSummary(summaryRes.data);
    setReviews(reviewsRes.data);
    setLoading(false);
  }, [fieldId]);

  useEffect(() => {
    if (visible && fieldId) {
      void load();
    }
  }, [visible, fieldId, load]);

  const avgText =
    summary?.avg_rating != null ? summary.avg_rating.toFixed(1) : t('fieldRatings.noRatingsYet');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('fieldRatings.opinionsTitle')}</Text>

          {loading ? (
            <ActivityIndicator color={Brand.primary} style={styles.loader} />
          ) : loadError ? (
            <Text style={styles.muted}>{t('fieldRatings.loadError')}</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryMain}>
                  <Text style={styles.avgValue}>{avgText}</Text>
                  {summary?.avg_rating != null ? (
                    <FieldRatingStars value={Math.round(summary.avg_rating)} size="sm" />
                  ) : null}
                </View>
                <Text style={styles.countText}>{formatRatingCount(summary?.rating_count ?? 0)}</Text>
              </View>

              {summary && summary.rating_count > 0 ? (
                <View style={styles.breakdown}>
                  {FIELD_RATING_DIMENSIONS.map((dimension) => {
                    const avg = summary[`${dimension}_avg` as keyof FieldRatingSummary];
                    if (typeof avg !== 'number') return null;
                    return (
                      <View key={dimension} style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>
                          {t(`fieldRatings.dimensions.${dimension}`)}
                        </Text>
                        <Text style={styles.breakdownValue}>{avg.toFixed(1)}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Text style={styles.reviewsTitle}>{t('fieldRatings.reviewsTitle')}</Text>
              {reviews.length === 0 ? (
                <Text style={styles.muted}>{t('fieldRatings.reviewsEmpty')}</Text>
              ) : (
                reviews.map((review) => <ReviewRow key={review.id} review={review} />)
              )}
            </ScrollView>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{t('common.close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReviewRow({ review }: { review: FieldRatingReview }) {
  const author = review.nick?.trim() || t('fieldRatings.anonymous');
  const overall =
    Number(review.overall_score) ||
    overallFromScores({
      surface: review.surface_score,
      lighting: review.lighting_score,
      cleanliness: review.cleanliness_score,
      accessibility: review.accessibility_score,
      safety: review.safety_score,
    });

  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewAuthor}>{author}</Text>
        <Text style={styles.reviewMeta}>{overall.toFixed(1)}</Text>
      </View>
      {review.event_starts_at ? (
        <Text style={styles.reviewEvent}>
          {t('fieldRatings.afterEvent')} {formatEventDateTime(review.event_starts_at)}
        </Text>
      ) : null}
      <FieldRatingStars value={Math.round(overall)} size="sm" />
      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Brand.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginBottom: 12,
  },
  loader: {
    marginVertical: 24,
  },
  muted: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingVertical: 8,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Brand.screenBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    marginBottom: 10,
  },
  summaryMain: {
    gap: 4,
  },
  avgValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  countText: {
    fontSize: 13,
    color: Brand.textSecondary,
    textAlign: 'right',
    flexShrink: 1,
    maxWidth: '45%',
  },
  breakdown: {
    gap: 6,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  breakdownLabel: {
    fontSize: 13,
    color: Brand.textSecondary,
    flex: 1,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  reviewsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  reviewRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    gap: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  reviewAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
    flex: 1,
  },
  reviewMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  reviewEvent: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  reviewComment: {
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 4,
  },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: Brand.screenBackground,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
});
