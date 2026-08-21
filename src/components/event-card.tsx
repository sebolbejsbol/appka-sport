import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon, PeopleIcon, PinIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
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
          <CalendarIcon size={14} color={Brand.textMuted} />
          <Text style={styles.metaText} numberOfLines={1}>
            {formatEventDateTime(event.starts_at)}
          </Text>
        </View>

        {event.location_name ? (
          <View style={styles.metaRow}>
            <PinIcon size={14} color={Brand.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location_name}
              {distanceText ? `  ·  ${distanceText}` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Perforacja "linii boiska" oddziela istotę (co/kiedy/gdzie) od stopki
          biletu (miejsca/cena) — patrz plan redesignu: karty eventów jako
          bilet na mecz, notche w tle ekranu po obu stronach. */}
      <View style={styles.perforationRow}>
        <View style={styles.notchLeft} />
        <View style={styles.perforationLine} />
        <View style={styles.notchRight} />
      </View>

      <View style={styles.stub}>
        {sub ? (
          <View style={[styles.subChip, { borderColor: meta.color }]}>
            <Text style={[styles.subChipText, { color: meta.color }]}>{sub}</Text>
          </View>
        ) : null}
        <View style={styles.footerSpacer} />
        <View style={styles.participantsRow}>
          <PeopleIcon size={14} color={Brand.textSecondary} />
          <Text style={styles.participants}>{participantsText}</Text>
        </View>
        <View style={[styles.priceChip, isPaid ? styles.priceChipPaid : styles.priceChipFree]}>
          <Text style={[styles.priceText, isPaid ? styles.priceTextPaid : styles.priceTextFree]}>
            {price}
          </Text>
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
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
    color: '#ffffff',
  },
  body: {
    padding: 14,
    paddingBottom: 12,
    gap: 6,
  },
  title: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 16,
    color: Brand.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    flex: 1,
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  // Perforacja "linii boiska": kreskowana linia + dwa półkola w kolorze tła
  // ekranu na krawędziach karty, imitujące dziurkowanie biletu.
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
  },
  perforationLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: Brand.border,
    borderStyle: 'dashed',
    marginHorizontal: -4,
  },
  notchLeft: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginLeft: -7,
  },
  notchRight: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginRight: -7,
  },
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    paddingTop: 12,
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
    fontFamily: BrandFonts.bodyBold,
    fontSize: 11,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  participants: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
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
    fontFamily: BrandFonts.bodyBold,
    fontSize: 12,
  },
  priceTextFree: {
    color: Brand.success,
  },
  priceTextPaid: {
    color: Brand.primaryDark,
  },
});
