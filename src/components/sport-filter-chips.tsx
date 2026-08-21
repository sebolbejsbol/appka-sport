import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useEventFilters } from '@/context/event-filters';
import { t } from '@/i18n';
import { FIELD_SPORTS, sportFilterLabel, type SportFilter } from '@/lib/sports';

const OPTIONS: SportFilter[] = ['all', ...FIELD_SPORTS];

export function SportFilterChips({ hideLabel }: { hideLabel?: boolean } = {}) {
  const { filters, setFilters } = useEventFilters();

  return (
    <View style={styles.wrap}>
      {hideLabel ? null : <Text style={styles.label}>{t('eventFilters.sportLabel')}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled">
        {OPTIONS.map((sport) => {
          const active = filters.sport === sport;
          return (
            <Pressable
              key={sport}
              onPress={() => setFilters({ sport })}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {sportFilterLabel(sport)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
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
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  chipTextActive: {
    color: Brand.primaryText,
  },
  pressed: {
    opacity: 0.88,
  },
});
