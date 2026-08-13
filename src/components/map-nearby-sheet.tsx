import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import type { CourtAvailability } from '@/lib/fields';
import { formatDistance } from '@/lib/geo';
import { getAvailabilityColor, getAvailabilityLabel } from '@/lib/map-theme';
import { formatCountEvent } from '@/lib/plural-pl';
import { fieldMarkerEmoji } from '@/lib/sports';

export type NearbyFieldItem = {
  id: string;
  name: string;
  sport: string | null;
  emoji: string;
  distanceMeters: number | null;
  /** Liczba AKTYWNYCH eventów na tym boisku (nie liczba graczy jednego eventu). */
  eventCount: number;
  availability: CourtAvailability;
  /** Rozbicie eventCount per dyscyplina, do chipów pod wierszem (może być puste). */
  eventsByCategory: { sport: string; count: number }[];
};

export const NEARBY_SHEET_COLLAPSED_HEIGHT = 116;
const EXPANDED_RATIO = 0.46;

type Props = {
  fields: NearbyFieldItem[];
  onSelect: (id: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  bottomOffset: number;
};

/** Panel „W pobliżu" pod mapą — zwinięty pokazuje pasek uchwytu + 1 wiersz, po dotknięciu rozwija się do listy. */
export function MapNearbySheet({ fields, onSelect, expanded, onToggleExpanded, bottomOffset }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const targetHeight = expanded
    ? Math.round(windowHeight * EXPANDED_RATIO)
    : NEARBY_SHEET_COLLAPSED_HEIGHT;

  const animatedStyle = useAnimatedStyle(() => ({
    height: withTiming(targetHeight, { duration: 240 }),
  }));

  if (fields.length === 0) return null;

  return (
    <Animated.View style={[styles.sheet, { bottom: bottomOffset }, animatedStyle]}>
      <Pressable onPress={onToggleExpanded} style={styles.handleWrap} accessibilityRole="button">
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('map.nearby.title')}</Text>
          <Text style={styles.subtitle}>{fields.length}</Text>
        </View>
      </Pressable>

      <FlatList
        data={fields}
        keyExtractor={(item) => item.id}
        scrollEnabled={expanded}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 12 }]}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
            <View style={[styles.dot, { backgroundColor: getAvailabilityColor(item.availability) }]} />
            <Text style={styles.emoji}>{item.emoji}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {getAvailabilityLabel(item.availability)}
                {` · ${formatCountEvent(item.eventCount)}`}
                {item.distanceMeters != null ? ` · ${formatDistance(item.distanceMeters)}` : ''}
              </Text>
              {item.eventsByCategory.length > 0 ? (
                <View style={styles.categoryChips}>
                  {item.eventsByCategory.map((c) => (
                    <View key={c.sport} style={styles.categoryChip}>
                      <Text style={styles.categoryChipText}>
                        {fieldMarkerEmoji(c.sport)} {c.count}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
    ...shadow('lg'),
  },
  handleWrap: {
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Brand.border,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    alignSelf: 'stretch',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
  },
  list: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
  },
  rowPressed: {
    backgroundColor: Brand.surfaceMuted,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  emoji: {
    fontSize: 18,
  },
  rowMain: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  rowMeta: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  categoryChip: {
    backgroundColor: Brand.surfaceMuted,
    borderRadius: Radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: Brand.textMuted,
    fontWeight: '300',
  },
});
