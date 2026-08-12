import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Brand, Layout, Radius } from '@/constants/theme';
import { shadow, Typography } from '@/constants/ui';
import { t } from '@/i18n';
import { subcategoryLabel, subcategoriesFor } from '@/lib/event-categories';
import type { DiscoverFilters } from '@/lib/discover-events';
import type { DateFilter, SkillLevel } from '@/lib/event-filters';

type Props = {
  visible: boolean;
  filters: DiscoverFilters;
  onChange: (patch: Partial<DiscoverFilters>) => void;
  onReset: () => void;
  onClose: () => void;
  resultCount: number;
};

export function MapFiltersSheet({
  visible,
  filters,
  onChange,
  onReset,
  onClose,
  resultCount,
}: Props) {
  const insets = useSafeAreaInsets();
  // Kategoria jest zawsze zablokowana na 'sport' (patrz DEFAULT_DISCOVER_FILTERS) —
  // apka skupia się na sporcie na razie, więc od razu pokazujemy dyscypliny.
  const subcats = subcategoriesFor('sport');

  // Etykiety budujemy przy renderze, aby od razu reagowały na zmianę języka.
  const SKILLS: { id: SkillLevel | 'all'; label: string }[] = [
    { id: 'all', label: t('eventFilters.skillEvery') },
    { id: 'beginner', label: t('eventFilters.skillBeginner') },
    { id: 'intermediate', label: t('eventFilters.skillIntermediate') },
    { id: 'advanced', label: t('eventFilters.skillAdvanced') },
  ];
  const DATES: { id: DateFilter; label: string }[] = [
    { id: 'all', label: t('eventFilters.dateAny') },
    { id: 'today', label: t('eventFilters.dateToday') },
    { id: 'tomorrow', label: t('eventFilters.dateTomorrow') },
    { id: 'week', label: t('eventFilters.dateWeek') },
  ];
  const PAYMENTS: { id: 'all' | 'free' | 'paid'; label: string }[] = [
    { id: 'all', label: t('eventFilters.paymentAll') },
    { id: 'free', label: t('eventFilters.paymentFree') },
    { id: 'paid', label: t('eventFilters.paymentPaid') },
  ];
  const DISTANCES: { id: number | null; label: string }[] = [
    { id: null, label: t('eventFilters.distanceAny') },
    { id: 5, label: '5 km' },
    { id: 10, label: '10 km' },
    { id: 25, label: '25 km' },
    { id: 50, label: '50 km' },
  ];
  const MIN_SPOTS: { id: number | null; label: string }[] = [
    { id: null, label: t('eventFilters.distanceAny') },
    { id: 2, label: '2+' },
    { id: 4, label: '4+' },
    { id: 8, label: '8+' },
  ];
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedActive =
    filters.skill !== 'all' ||
    filters.payment !== 'all' ||
    filters.distanceKm != null ||
    filters.minFreeSpots != null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text style={styles.title}>{t('eventFilters.sheetTitle')}</Text>
          <Pressable onPress={onReset} hitSlop={8}>
            <Text style={styles.reset}>{t('eventFilters.clearShort')}</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}>
          {subcats.length > 0 ? (
            <Group label={t('eventFilters.sportTypeLabel')}>
              <Chip
                label={t('eventCategories.all')}
                active={filters.subcategory === null}
                onPress={() => onChange({ subcategory: null })}
              />
              {subcats.map((sub) => (
                <Chip
                  key={sub.id}
                  label={subcategoryLabel(sub.id) ?? sub.id}
                  active={filters.subcategory === sub.id}
                  onPress={() => onChange({ subcategory: sub.id })}
                />
              ))}
            </Group>
          ) : null}

          <Group label={t('eventFilters.whenLabel')}>
            {DATES.map((d) => (
              <Chip
                key={d.id}
                label={d.label}
                active={filters.date === d.id}
                onPress={() => onChange({ date: d.id })}
              />
            ))}
          </Group>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('eventFilters.onlyFreeSpotsLong')}</Text>
            <Switch
              value={filters.onlyFreeSpots}
              onValueChange={(v) => onChange({ onlyFreeSpots: v })}
              trackColor={{ true: Brand.primaryMuted, false: Brand.border }}
              thumbColor={filters.onlyFreeSpots ? Brand.primary : '#f4f3f4'}
            />
          </View>

          <Pressable
            style={styles.advancedToggle}
            onPress={() => setAdvancedOpen((v) => !v)}>
            <Text style={styles.advancedToggleText}>
              {advancedOpen ? t('eventFilters.lessOptions') : t('eventFilters.moreOptions')}
              {!advancedOpen && advancedActive ? ' •' : ''}
            </Text>
            <Text style={styles.advancedChevron}>{advancedOpen ? '▲' : '▼'}</Text>
          </Pressable>

          {advancedOpen ? (
            <>
              <Group label={t('eventFilters.skillLabel')}>
                {SKILLS.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.label}
                    active={filters.skill === s.id}
                    onPress={() => onChange({ skill: s.id })}
                  />
                ))}
              </Group>

              <Group label={t('eventFilters.paymentLabel')}>
                {PAYMENTS.map((p) => (
                  <Chip
                    key={p.id}
                    label={p.label}
                    active={filters.payment === p.id}
                    onPress={() => onChange({ payment: p.id })}
                  />
                ))}
              </Group>

              <Group label={t('eventFilters.distanceShort')}>
                {DISTANCES.map((d) => (
                  <Chip
                    key={String(d.id)}
                    label={d.label}
                    active={filters.distanceKm === d.id}
                    onPress={() => onChange({ distanceKm: d.id })}
                  />
                ))}
              </Group>

              <Group label={t('eventFilters.minSpotsLabel')}>
                {MIN_SPOTS.map((m) => (
                  <Chip
                    key={String(m.id)}
                    label={m.label}
                    active={filters.minFreeSpots === m.id}
                    onPress={() => onChange({ minFreeSpots: m.id })}
                  />
                ))}
              </Group>
            </>
          ) : null}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={({ pressed }) => [styles.apply, pressed && styles.pressed]}>
          <Text style={styles.applyText}>
            {resultCount > 0
              ? t('eventFilters.showResults').replace('{count}', String(resultCount))
              : t('common.close')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function Chip({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.chip,
        active && (color ? { backgroundColor: color, borderColor: color } : styles.chipActive),
      ]}
      onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Brand.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 10,
    ...shadow('lg'),
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: Brand.borderStrong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    ...Typography.sectionTitle,
    fontSize: 19,
  },
  reset: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.primary,
  },
  scroll: {
    paddingBottom: 12,
  },
  group: {
    marginTop: 16,
  },
  groupLabel: {
    ...Typography.label,
    marginBottom: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  chipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    paddingVertical: 4,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surfaceMuted,
  },
  advancedToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  advancedChevron: {
    fontSize: 11,
    color: Brand.textMuted,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  apply: {
    marginTop: 14,
    backgroundColor: Brand.primary,
    borderRadius: Radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow('sm'),
  },
  applyText: {
    color: Brand.primaryText,
    fontSize: 16,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.92,
  },
});
