import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { categoryLabel, categoryMeta, subcategoryLabel } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { formatEventDateTime } from '@/lib/datetime';
import { distanceMeters, formatDistance, type LngLat } from '@/lib/geo';

type Props = {
  event: DiscoverEvent;
  userCoords: LngLat | null;
  onPress: (event: DiscoverEvent) => void;
};

export function formatEventPrice(event: DiscoverEvent): string {
  if (event.payment_status !== 'paid') return t('createEvent.free');
  if (event.price_cents == null) return t('eventFilters.paymentPaid');
  const zl = event.price_cents / 100;
  return `${zl % 1 === 0 ? zl.toFixed(0) : zl.toFixed(2)} zł`;
}

function EventCardComponent({ event, userCoords, onPress }: Props) {
  const meta = categoryMeta(event.category);
  const catLabel = categoryLabel(event.category);
  const sub = subcategoryLabel(event.subcategory);
  const title = event.title?.trim() || `${catLabel}${sub ? ` · ${sub}` : ''}`;

  const distanceText =
    userCoords && event.lng != null && event.lat != null
      ? formatDistance(distanceMeters(userCoords, [event.lng, event.lat]))
      : null;

  const participantsText =
    event.max_players != null
      ? `${event.participant_count}/${event.max_players}`
      : `${event.participant_count}`;

  const price = formatEventPrice(event);
  const isPaid = event.payment_status === 'paid';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(event)}>
      <View style={styles.media}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imageFallback, { backgroundColor: meta.tint }]}>
            <Text style={styles.fallbackEmoji}>{meta.emoji}</Text>
          </View>
        )}
        <View style={[styles.categoryBadge, { backgroundColor: meta.color }]}>
          <Text style={styles.categoryBadgeText}>
            {meta.emoji} {catLabel}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>📅</Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {formatEventDateTime(event.starts_at)}
          </Text>
        </View>

        {event.location_name ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location_name}
              {distanceText ? `  ·  ${distanceText}` : ''}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          {sub ? (
            <View style={[styles.subChip, { borderColor: meta.color }]}>
              <Text style={[styles.subChipText, { color: meta.color }]}>{sub}</Text>
            </View>
          ) : null}
          <View style={styles.footerSpacer} />
          <Text style={styles.participants}>👥 {participantsText}</Text>
          <View style={[styles.priceChip, isPaid ? styles.priceChipPaid : styles.priceChipFree]}>
            <Text style={[styles.priceText, isPaid ? styles.priceTextPaid : styles.priceTextFree]}>
              {price}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// Memo: przy zmianie filtrów/odświeżeniu listy nie przerysowujemy kart, których
// propsy się nie zmieniły — płynniejsze przewijanie długich list.
export const EventCard = memo(EventCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
    ...shadow('sm'),
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  media: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: Brand.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: {
    fontSize: 52,
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Brand.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 13,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  footerSpacer: {
    flex: 1,
  },
  subChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  subChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  participants: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  priceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  priceChipFree: {
    backgroundColor: Brand.successLight,
  },
  priceChipPaid: {
    backgroundColor: Brand.primaryLight,
  },
  priceText: {
    fontSize: 12,
    fontWeight: '800',
  },
  priceTextFree: {
    color: Brand.success,
  },
  priceTextPaid: {
    color: Brand.primaryDark,
  },
});
