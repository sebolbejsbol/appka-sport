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
import { NavigateToFieldButton } from '@/components/navigate-to-field-button';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useUserLocation } from '@/hooks/use-user-location';
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
  const { coords: userCoords } = useUserLocation();

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
  const availability = field?.availability ?? ('empty' as CourtAvailability);
  const availabilityColor = getAvailabilityColor(availability);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}>
      <View style={styles.photoHeader}>
        {field?.photo_url ? (
          <Image source={{ uri: field.photo_url }} style={styles.photoImage} resizeMode="cover" />
        ) : null}
        <Pressable
          onPress={() => goBack('/')}
          hitSlop={12}
          style={({ pressed }) => [styles.backCircle, { top: insets.top + 12 }, pressed && styles.pressed]}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError || !field ? (
        <Text style={styles.muted}>{t('field.loadError')}</Text>
      ) : (
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={styles.placeName}>{formatCourtName(field.name, field.sport)}</Text>
              {(storedStreet ?? geoAddress) ? (
                <Text style={styles.subtitle}>{storedStreet ?? geoAddress}</Text>
              ) : null}
            </View>
            {summary?.avg_rating != null ? (
              <View style={styles.ratingPill}>
                <Text style={styles.ratingPillStar}>★</Text>
                <Text style={styles.ratingPillText}>{summary.avg_rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.pillsRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{formatFieldSport(field.sport)}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: `${availabilityColor}1F` }]}>
              <View style={[styles.pillDot, { backgroundColor: availabilityColor }]} />
              <Text style={[styles.pillText, { color: availabilityColor }]}>
                {getAvailabilityLabel(availability)}
              </Text>
            </View>
          </View>

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
                  <Text style={styles.countText}>{formatRatingCount(summary?.rating_count ?? 0)}</Text>
                </View>

                {summary && summary.rating_count > 0 ? (
                  <View style={styles.breakdown}>
                    {FIELD_RATING_DIMENSIONS.map((dimension) => {
                      const avg = summary[`${dimension}_avg` as keyof FieldRatingSummary];
                      if (typeof avg !== 'number') return null;
                      return (
                        <View key={dimension} style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel} numberOfLines={1}>
                            {t(`fieldRatings.dimensions.${dimension}`)}
                          </Text>
                          <View style={styles.breakdownTrack}>
                            <View
                              style={[styles.breakdownFill, { width: `${(avg / 5) * 100}%` }]}
                            />
                          </View>
                          <Text style={styles.breakdownValue}>{avg.toFixed(1)}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <Text style={styles.sectionTitle}>{t('fieldRatings.reviewsTitle')}</Text>
              {reviews.length === 0 ? (
                <Text style={styles.muted}>{t('fieldRatings.reviewsEmpty')}</Text>
              ) : (
                reviews.map((review) => <ReviewRow key={review.id} review={review} />)
              )}
            </>
          )}

          <View style={styles.navigateWrap}>
            <NavigateToFieldButton
              destination={{ lat: field.lat, lng: field.lng, name: field.name, fieldId: field.id }}
              userCoords={userCoords}
              variant="primary"
              style={styles.navigateBtn}
            />
          </View>
        </View>
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
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewAuthor}>{author}</Text>
        <FieldRatingStars value={Math.round(overall)} size="sm" />
      </View>
      {review.event_starts_at ? (
        <Text style={styles.reviewEvent}>
          {t('fieldRatings.afterEvent')} {formatEventDateTime(review.event_starts_at)}
        </Text>
      ) : null}
      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  photoHeader: {
    height: 210,
    backgroundColor: Brand.surfaceMuted,
  },
  photoImage: {
    ...StyleSheet.absoluteFill,
  },
  backCircle: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow('sm'),
  },
  backIcon: {
    fontSize: 20,
    color: Brand.textPrimary,
    marginTop: -1,
  },
  pressed: {
    opacity: 0.85,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  loader: {
    marginVertical: 24,
  },
  muted: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    color: Brand.textMuted,
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleBlock: {
    flex: 1,
  },
  placeName: {
    fontFamily: BrandFonts.display,
    fontSize: 24,
    color: Brand.textPrimary,
    lineHeight: 26,
  },
  subtitle: {
    fontFamily: BrandFonts.body,
    fontSize: 13.5,
    color: Brand.textMuted,
    marginTop: 6,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Brand.surface,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...shadow('sm'),
  },
  ratingPillStar: {
    fontSize: 14,
    color: Brand.amber,
  },
  ratingPillText: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    color: Brand.textPrimary,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surfaceMuted,
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pillText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    color: Brand.textSecondary,
  },
  summaryCard: {
    backgroundColor: Brand.surface,
    borderRadius: 16,
    marginTop: 18,
    padding: 16,
    gap: 12,
    ...shadow('sm'),
  },
  summaryMain: {
    alignItems: 'center',
    gap: 4,
  },
  avgValue: {
    fontFamily: BrandFonts.display,
    fontVariant: ['tabular-nums'],
    fontSize: 32,
    color: Brand.textPrimary,
  },
  countText: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
    marginTop: 2,
  },
  breakdown: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Brand.divider,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
  },
  breakdownLabel: {
    width: 90,
    fontFamily: BrandFonts.body,
    fontSize: 12.5,
    color: Brand.textSecondary,
  },
  breakdownTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: Brand.surfaceMuted,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Brand.amber,
  },
  breakdownValue: {
    width: 26,
    textAlign: 'right',
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 12.5,
    color: Brand.textPrimary,
  },
  sectionTitle: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 11.5,
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
  },
  reviewCard: {
    backgroundColor: Brand.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 4,
    ...shadow('sm'),
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  reviewAuthor: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13.5,
    color: Brand.textPrimary,
  },
  reviewEvent: {
    fontFamily: BrandFonts.body,
    fontSize: 12,
    color: Brand.textMuted,
  },
  reviewComment: {
    fontFamily: BrandFonts.body,
    fontSize: 13.5,
    color: Brand.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  navigateWrap: {
    marginTop: 24,
  },
  navigateBtn: {
    width: '100%',
    paddingVertical: 15,
  },
});
