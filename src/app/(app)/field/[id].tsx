import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldRatingStars } from '@/components/field-rating-stars';
import { Brand, BrandFonts } from '@/constants/theme';
import { Typography } from '@/constants/ui';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import { formatCourtName, formatFieldSport, parseStoredFieldName } from '@/lib/field-display';
import {
  FIELD_RATING_DIMENSIONS,
  getFieldRatingSummary,
  listFieldRatings,
  overallFromScores,
  type FieldRatingReview,
  type FieldRatingSummary,
} from '@/lib/field-ratings';
import { getFieldsByIds, type CourtAvailability, type FieldPoint } from '@/lib/fields';
import { reverseGeocode } from '@/lib/map-geocoding';
import { getAvailabilityColor, getAvailabilityLabel } from '@/lib/map-theme';
import { goBack } from '@/lib/navigation';
import { formatRatingCount } from '@/lib/plural-pl';

export default function FieldDetailsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const fieldId = params.id;

  const [field, setField] = useState<FieldPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [geoAddress, setGeoAddress] = useState<string | null>(null);
  const [summary, setSummary] = useState<FieldRatingSummary | null>(null);
  const [reviews, setReviews] = useState<FieldRatingReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);

  useEffect(() => {
    if (!fieldId) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(false);
    void getFieldsByIds([fieldId]).then(({ data, error }) => {
      if (!active) return;
      setField(data[0] ?? null);
      setLoadError(Boolean(error) || data.length === 0);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId) return;
    let active = true;
    setReviewsLoading(true);
    setReviewsError(false);
    void Promise.all([getFieldRatingSummary(fieldId), listFieldRatings(fieldId)]).then(
      ([summaryRes, reviewsRes]) => {
        if (!active) return;
        if (summaryRes.error || reviewsRes.error) {
          setReviewsError(true);
        } else {
          setSummary(summaryRes.data);
          setReviews(reviewsRes.data);
        }
        setReviewsLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [fieldId]);

  const storedStreet = useMemo(() => parseStoredFieldName(field?.name).street, [field?.name]);

  useEffect(() => {
    if (!field || storedStreet) {
      setGeoAddress(null);
      return;
    }
    let active = true;
    setGeoAddress(null);
    void reverseGeocode([field.lng, field.lat]).then((addr) => {
      if (!active || !addr) return;
      setGeoAddress(addr.replace(/,\s*(Polska|Poland)\s*$/i, '').trim());
    });
    return () => {
      active = false;
    };
  }, [field?.id, field?.lng, field?.lat, storedStreet]);

  const avgText = summary?.avg_rating != null ? summary.avg_rating.toFixed(1) : t('fieldRatings.noRatingsYet');

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
      ]}>
      <Pressable onPress={() => goBack('/')} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('field.detailsTitle')}</Text>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError || !field ? (
        <Text style={styles.muted}>{t('field.loadError')}</Text>
      ) : (
        <>
          {field.photo_url ? (
            <Image source={{ uri: field.photo_url }} style={styles.photo} resizeMode="cover" />
          ) : null}

          <Text style={styles.placeName}>{formatCourtName(field.name, field.sport)}</Text>
          {(storedStreet ?? geoAddress) ? (
            <Text style={styles.subtitle}>{storedStreet ?? geoAddress}</Text>
          ) : null}

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{formatFieldSport(field.sport)}</Text>
          </View>

          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getAvailabilityColor(field.availability ?? ('empty' as CourtAvailability)) },
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: getAvailabilityColor(field.availability ?? ('empty' as CourtAvailability)) },
              ]}>
              {getAvailabilityLabel(field.availability ?? ('empty' as CourtAvailability))}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>{t('fieldRatings.opinionsTitle')}</Text>

          {reviewsLoading ? (
            <ActivityIndicator color={Brand.primary} style={styles.loader} />
          ) : reviewsError ? (
            <Text style={styles.muted}>{t('fieldRatings.loadError')}</Text>
          ) : (
            <>
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
            </>
          )}
        </>
      )}
    </ScrollView>
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
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    ...Typography.screenTitle,
    marginTop: 8,
    marginBottom: 16,
  },
  loader: {
    marginVertical: 24,
  },
  muted: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingVertical: 8,
  },
  photo: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: Brand.surfaceMuted,
    marginBottom: 12,
  },
  placeName: {
    fontFamily: BrandFonts.display,
    fontSize: 25,
    color: Brand.textPrimary,
  },
  subtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  metaText: {
    fontFamily: BrandFonts.bodyMedium,
    fontSize: 14,
    color: Brand.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
  },
  sectionTitle: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 18,
    marginBottom: 10,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Brand.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Brand.border,
    marginBottom: 10,
  },
  summaryMain: {
    gap: 4,
  },
  avgValue: {
    fontFamily: BrandFonts.display,
    fontVariant: ['tabular-nums'],
    fontSize: 30,
    color: Brand.textPrimary,
  },
  countText: {
    fontFamily: BrandFonts.body,
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
    paddingVertical: 4,
  },
  breakdownLabel: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: Brand.textPrimary,
  },
  reviewsTitle: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 15,
    color: Brand.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  reviewRow: {
    paddingVertical: 12,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderTopColor: Brand.divider,
    gap: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  reviewAuthor: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 14,
    color: Brand.textPrimary,
    flex: 1,
  },
  reviewMeta: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    color: Brand.textPrimary,
  },
  reviewEvent: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
  },
  reviewComment: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textSecondary,
    marginTop: 4,
  },
});
