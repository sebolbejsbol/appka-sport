import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { DistanceFilterSlider } from '@/components/distance-filter-slider';
import { FilterDropdown } from '@/components/filter-dropdown';
import { SportFilterChips } from '@/components/sport-filter-chips';
import { Brand } from '@/constants/theme';
import { useEventFilters } from '@/context/event-filters';
import { t } from '@/i18n';
import type { DateFilter, EventType, PaymentFilter, SkillLevel } from '@/lib/event-filters';
import {
  dateFilterLabel,
  eventTypeLabel,
  paymentFilterLabel,
  skillLevelLabel,
} from '@/lib/event-filter-display';

export function EventFiltersForm() {
  const { filters, setFilters } = useEventFilters();
  // Poziom zaawansowania i płatność chowamy pod „Opcje zaawansowane".
  // Rozwijamy automatycznie, gdy któryś z tych filtrów jest aktywny.
  const hasAdvancedActive = filters.skillLevel !== 'all' || filters.payment !== 'all';
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedActive);

  return (
    <View style={styles.form}>
      <SportFilterChips />

      <FilterDropdown<EventType | 'all'>
        label={t('eventFilters.typeLabel')}
        value={filters.eventType}
        options={(
          ['all', 'match', 'training', 'tournament', 'sparring', 'looking_for_players'] as const
        ).map((value) => ({
          value,
          label: eventTypeLabel(value),
        }))}
        onChange={(eventType) => setFilters({ eventType })}
      />

      <FilterDropdown<DateFilter>
        label={t('eventFilters.dateLabel')}
        value={filters.date}
        options={(['all', 'today', 'tomorrow', 'week'] as const).map((value) => ({
          value,
          label: dateFilterLabel(value),
        }))}
        onChange={(date) => setFilters({ date })}
      />

      <DistanceFilterSlider
        value={filters.distanceKm}
        onChange={(distanceKm) => setFilters({ distanceKm })}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{t('eventFilters.onlyFreeSpots')}</Text>
        <Switch
          value={filters.onlyFreeSpots}
          onValueChange={(onlyFreeSpots) => setFilters({ onlyFreeSpots })}
          trackColor={{ true: Brand.primary }}
        />
      </View>

      <Pressable
        onPress={() => setAdvancedOpen((value) => !value)}
        style={({ pressed }) => [styles.advancedToggle, pressed && styles.advancedTogglePressed]}>
        <Text style={styles.advancedToggleText}>{t('eventFilters.advancedOptions')}</Text>
        <Text style={styles.advancedChevron}>{advancedOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {advancedOpen ? (
        <View style={styles.advancedBody}>
          <FilterDropdown<SkillLevel | 'all'>
            label={t('eventFilters.skillLabel')}
            value={filters.skillLevel}
            options={(['all', 'beginner', 'intermediate', 'advanced'] as const).map((value) => ({
              value,
              label: skillLevelLabel(value),
            }))}
            onChange={(skillLevel) => setFilters({ skillLevel })}
          />

          <FilterDropdown<PaymentFilter>
            label={t('eventFilters.paymentLabel')}
            value={filters.payment}
            options={(['all', 'free', 'paid'] as const).map((value) => ({
              value,
              label: paymentFilterLabel(value),
            }))}
            onChange={(payment) => setFilters({ payment })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 15,
    color: Brand.textPrimary,
    flex: 1,
    paddingRight: 12,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  advancedTogglePressed: {
    opacity: 0.85,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  advancedChevron: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  advancedBody: {
    gap: 14,
  },
});
