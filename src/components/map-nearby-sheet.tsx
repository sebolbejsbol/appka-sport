import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import type { CourtAvailability } from '@/lib/fields';
import { formatDistance } from '@/lib/geo';

export type NearbyFieldItem = {
  id: string;
  name: string;
  sport: string | null;
  emoji: string;
  distanceMeters: number | null;
  countLabel: string;
  availability: CourtAvailability;
};

export const NEARBY_SHEET_COLLAPSED_HEIGHT = 116;
const EXPANDED_RATIO = 0.46;

function availabilityColor(a: CourtAvailability): string {
  switch (a) {
    case 'open':
      return Brand.success;
    case 'filling':
      return Brand.warning;
    case 'full':
      return Brand.danger;
    default:
      return '#94a3b8';
  }
}

function availabilityLabel(a: CourtAvailability): string {
  switch (a) {
    case 'open':
      return t('map.nearby.availabilityOpen');
    case 'filling':
      return t('map.nearby.availabilityFilling');
    case 'full':
      return t('map.nearby.availabilityFull');
    default:
      return t('map.nearby.availabilityEmpty');
  }
}

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
            <View style={[styles.dot, { backgroundColor: availabilityColor(item.availability) }]} />
            <Text style={styles.emoji}>{item.emoji}</Text>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {availabilityLabel(item.availability)}
                {item.countLabel ? ` · ${item.countLabel}` : ''}
                {item.distanceMeters != null ? ` · ${formatDistance(item.distanceMeters)}` : ''}
              </Text>
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
  chevron: {
    fontSize: 20,
    color: Brand.textMuted,
    fontWeight: '300',
  },
});
