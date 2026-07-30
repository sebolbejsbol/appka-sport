import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useEventFilters } from '@/context/event-filters';
import { t, type TKey } from '@/i18n';
import type { EventFilters } from '@/lib/event-filters';

type QuickChip = {
  key: string;
  labelKey: TKey;
  isActive: (filters: EventFilters) => boolean;
  onToggle: (
    filters: EventFilters,
    setFilters: (patch: Partial<EventFilters>) => void,
  ) => void;
};

const QUICK_CHIPS: QuickChip[] = [
  {
    key: 'today',
    labelKey: 'eventFilters.chipToday',
    isActive: (f) => f.date === 'today',
    onToggle: (f, set) => set({ date: f.date === 'today' ? 'all' : 'today' }),
  },
  {
    key: 'tomorrow',
    labelKey: 'eventFilters.chipTomorrow',
    isActive: (f) => f.date === 'tomorrow',
    onToggle: (f, set) => set({ date: f.date === 'tomorrow' ? 'all' : 'tomorrow' }),
  },
  {
    key: 'week',
    labelKey: 'eventFilters.chipWeek',
    isActive: (f) => f.date === 'week',
    onToggle: (f, set) => set({ date: f.date === 'week' ? 'all' : 'week' }),
  },
  {
    key: 'spots',
    labelKey: 'eventFilters.chipSpots',
    isActive: (f) => f.onlyFreeSpots,
    onToggle: (f, set) => set({ onlyFreeSpots: !f.onlyFreeSpots }),
  },
  {
    key: 'nearby',
    labelKey: 'eventFilters.chipNearby',
    isActive: (f) => f.distanceKm != null,
    onToggle: (f, set) => set({ distanceKm: f.distanceKm != null ? null : 5 }),
  },
];

type Props = {
  onMorePress?: () => void;
  showMoreButton?: boolean;
};

export function EventQuickFilterChips({ onMorePress, showMoreButton = true }: Props) {
  const { filters, setFilters, activeFilterCount } = useEventFilters();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      {QUICK_CHIPS.map((chip) => {
        const active = chip.isActive(filters);
        return (
          <Pressable
            key={chip.key}
            onPress={() => chip.onToggle(filters, setFilters)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {t(chip.labelKey)}
            </Text>
          </Pressable>
        );
      })}

      {showMoreButton && onMorePress ? (
        <Pressable
          onPress={onMorePress}
          style={({ pressed }) => [
            styles.chip,
            styles.moreChip,
            activeFilterCount > 0 && styles.moreChipActive,
            pressed && styles.pressed,
          ]}>
          <Text
            style={[
              styles.chipText,
              styles.moreChipText,
              activeFilterCount > 0 && styles.chipTextActive,
            ]}>
            {t('eventFilters.more')}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  chipTextActive: {
    color: Brand.primaryText,
  },
  moreChip: {
    borderStyle: 'dashed',
  },
  moreChipActive: {
    borderStyle: 'solid',
    backgroundColor: Brand.primaryLight,
    borderColor: Brand.primary,
  },
  moreChipText: {
    color: Brand.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
});
