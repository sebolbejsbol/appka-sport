import { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventFiltersForm } from '@/components/event-filters-form';
import { EventQuickFilterChips } from '@/components/event-quick-filter-chips';
import { Brand } from '@/constants/theme';
import { useEventFilters } from '@/context/event-filters';
import { t } from '@/i18n';
import { formatMapLiveCount } from '@/lib/plural-pl';
import { buildActiveFilterSummary } from '@/lib/event-filter-display';

export function MapEventFiltersBar() {
  const insets = useSafeAreaInsets();
  const { filters, filteredEvents, activeFilterCount, resetFilters } = useEventFilters();
  const [expanded, setExpanded] = useState(false);

  const panelMaxHeight = useMemo(
    () => Math.min(300, Dimensions.get('window').height * 0.36),
    [],
  );

  const fieldsWithEvents = useMemo(
    () => new Set(filteredEvents.map((e) => e.field_id)).size,
    [filteredEvents],
  );

  const activeSummary = useMemo(
    () => (activeFilterCount > 0 ? buildActiveFilterSummary(filters) : ''),
    [activeFilterCount, filters],
  );

  const liveCountText = formatMapLiveCount(fieldsWithEvents, filteredEvents.length);

  return (
    <View style={[styles.anchor, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      {expanded ? (
        <View style={styles.liveBadge} pointerEvents="none">
          <Text style={styles.liveBadgeText}>{liveCountText}</Text>
          {fieldsWithEvents === 0 ? (
            <Text style={styles.liveBadgeEmpty}>{t('eventFilters.mapLiveEmpty')}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={[styles.card, expanded && { maxHeight: panelMaxHeight }]}>
        <Pressable
          onPress={() => setExpanded((prev) => !prev)}
          style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
          <View style={styles.triggerMain}>
            <Text style={styles.prompt}>{t('eventFilters.mapSearchPrompt')}</Text>
            {expanded ? (
              <Text style={styles.resultsHint}>{t('eventFilters.mapSearchExpandedHint')}</Text>
            ) : activeSummary ? (
              <Text style={styles.activeSummary} numberOfLines={1}>
                {activeSummary}
              </Text>
            ) : (
              <Text style={styles.resultsHint}>{liveCountText}</Text>
            )}
          </View>
          <Text style={styles.chevron}>{expanded ? '▴' : '▾'}</Text>
        </Pressable>

        {expanded ? (
          <View style={styles.body}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled>
              <EventQuickFilterChips showMoreButton={false} />
              <EventFiltersForm />
            </ScrollView>

            {activeFilterCount > 0 ? (
              <Pressable onPress={resetFilters} style={styles.clearBtn}>
                <Text style={styles.clearText}>{t('eventFilters.clear')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 25,
  },
  liveBadge: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  liveBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.primaryText,
  },
  liveBadgeEmpty: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Brand.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  triggerMain: {
    flex: 1,
    gap: 2,
  },
  prompt: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  resultsHint: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  activeSummary: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.primary,
  },
  chevron: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingTop: 2,
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    backgroundColor: Brand.screenBackground,
    paddingBottom: 8,
    flexShrink: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 12,
  },
  clearBtn: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
  },
  pressed: {
    opacity: 0.9,
  },
});
