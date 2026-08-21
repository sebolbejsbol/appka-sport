import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { CalendarIcon, PeopleIcon, PinIcon } from '@/components/icons';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { markerEmoji, subcategoryAccentColor, subcategoryLabel } from '@/lib/event-categories';
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

/**
 * Redesign 2026-08-21, druga tura ("wygląda prawie tak samo jak przed
 * redesignem" — feedback usera). Nie kosmetyka na starym układzie: karta
 * ma teraz solidny, kolorowy blok nagłówka (prawdziwy kolor SPORTU —
 * subcategoryAccentColor, nie stały niebieski `categoryMeta` używany
 * wcześniej, bo `category` to zawsze 'sport') z dużą ikoną i tytułem prosto
 * na kolorze — zdjęcie (gdy jest) dostaje ciemny gradient pod spodem, żeby
 * tytuł dało się czytać bezpośrednio na fotografii zamiast w małej plakietce
 * w rogu. To jest największa, najbardziej widoczna zmiana karty w całej apce
 * — ma się rzucać w oczy bez porównywania ze starą wersją.
 */
function EventCardComponent({ event, userCoords, onPress }: Props) {
  const accent = subcategoryAccentColor(event.subcategory);
  const emoji = markerEmoji(event.category, event.subcategory);
  const sub = subcategoryLabel(event.subcategory);
  const title = event.title?.trim() || sub || t('eventCategories.sport');

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
  const hasPhoto = Boolean(event.image_url);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(event)}>
      <View style={[styles.header, !hasPhoto && { backgroundColor: accent }]}>
        {hasPhoto ? (
          <>
            <Image source={{ uri: event.image_url! }} style={styles.headerImage} resizeMode="cover" />
            <LinearGradient
              colors={['rgba(10,14,22,0)', 'rgba(10,14,22,0.82)']}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <Text style={styles.headerEmoji}>{emoji}</Text>
        )}

        {sub ? (
          <View style={[styles.subPill, hasPhoto && styles.subPillOnPhoto]}>
            <Text style={[styles.subPillText, hasPhoto ? styles.subPillTextOnPhoto : { color: accent }]}>
              {sub}
            </Text>
          </View>
        ) : null}

        <Text style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>

      <View style={styles.body}>
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

        {/* Perforacja "linii boiska": kreskowana linia + dwa półkola w kolorze
            tła ekranu, imitujące dziurkowanie biletu — motyw powtórzony na
            wszystkich kartach/tabelkach w apce. */}
        <View style={styles.perforationRow}>
          <View style={styles.notchLeft} />
          <View style={styles.perforationLine} />
          <View style={styles.notchRight} />
        </View>

        <View style={styles.stub}>
          <View style={styles.participantsRow}>
            <PeopleIcon size={15} color={Brand.textPrimary} />
            <Text style={styles.participants}>{participantsText}</Text>
          </View>
          <View style={styles.footerSpacer} />
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
    borderRadius: 22,
    overflow: 'hidden',
    ...shadow('md'),
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  header: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  headerImage: {
    ...StyleSheet.absoluteFill,
  },
  headerEmoji: {
    fontSize: 64,
  },
  headerTitle: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    fontFamily: BrandFonts.display,
    fontSize: 22,
    color: '#ffffff',
    textShadowColor: 'rgba(10,14,22,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  subPillOnPhoto: {
    backgroundColor: '#ffffff',
  },
  subPillText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  subPillTextOnPhoto: {
    color: Brand.ink,
  },
  body: {
    padding: 16,
    paddingTop: 14,
    gap: 7,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  metaText: {
    flex: 1,
    fontFamily: BrandFonts.bodyMedium,
    fontSize: 13.5,
    color: Brand.textSecondary,
  },
  perforationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 1,
    marginTop: 8,
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
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginLeft: -8,
  },
  notchRight: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: Brand.screenBackground,
    marginRight: -8,
  },
  stub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participants: {
    fontFamily: BrandFonts.monoSemibold,
    fontVariant: ['tabular-nums'],
    fontSize: 16,
    color: Brand.textPrimary,
  },
  priceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  priceChipFree: {
    backgroundColor: Brand.pitch,
  },
  priceChipPaid: {
    backgroundColor: Brand.primary,
  },
  priceText: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
  },
  priceTextFree: {
    color: '#ffffff',
  },
  priceTextPaid: {
    color: '#ffffff',
  },
});
