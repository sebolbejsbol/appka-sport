import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import {
  EVENT_CATEGORIES,
  CATEGORY_META,
  categoryLabel,
  subcategoryLabel,
  subcategoriesFor,
  type CategoryFilter,
} from '@/lib/event-categories';

type Props = {
  topOffset: number;
  category: CategoryFilter;
  subcategory: string | null;
  activeCount: number;
  onSelectCategory: (category: CategoryFilter) => void;
  onSelectSubcategory: (subcategory: string | null) => void;
  onOpenFilters: () => void;
};

/**
 * Pływający pasek filtrów nad mapą — kategorie + podkategorie,
 * spójny z zakładką Eventy. Wybór np. Sport → Koszykówka pokazuje
 * wszystkie bąble danej dyscypliny.
 */
export function MapCategoryFilterBar({
  topOffset,
  category,
  subcategory,
  activeCount,
  onSelectCategory,
  onSelectSubcategory,
  onOpenFilters,
}: Props) {
  const subcats = category !== 'all' ? subcategoriesFor(category) : [];

  return (
    <View style={[styles.anchor, { top: topOffset }]} pointerEvents="box-none">
      <View style={styles.firstRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          keyboardShouldPersistTaps="handled">
          <Chip
            label={t('eventCategories.all')}
            emoji="✦"
            color={Brand.primary}
            active={category === 'all'}
            onPress={() => onSelectCategory('all')}
          />
          {EVENT_CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={categoryLabel(cat)}
              emoji={CATEGORY_META[cat].emoji}
              color={CATEGORY_META[cat].color}
              active={category === cat}
              onPress={() => onSelectCategory(cat)}
            />
          ))}
        </ScrollView>

        <Pressable style={styles.filterBtn} onPress={onOpenFilters} hitSlop={6}>
          <Text style={styles.filterBtnText}>⚙</Text>
          {activeCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {subcats.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subRow}
          keyboardShouldPersistTaps="handled">
          <SubChip
            label={t('eventCategories.all')}
            active={subcategory === null}
            onPress={() => onSelectSubcategory(null)}
          />
          {subcats.map((sub) => (
            <SubChip
              key={sub.id}
              label={subcategoryLabel(sub.id) ?? sub.id}
              active={subcategory === sub.id}
              onPress={() => onSelectSubcategory(sub.id)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  emoji,
  color,
  active,
  onPress,
}: {
  label: string;
  emoji: string;
  color: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {emoji} {label}
      </Text>
    </Pressable>
  );
}

function SubChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.subChip, active && styles.subChipActive]} onPress={onPress}>
      <Text style={[styles.subChipText, active && styles.subChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 22,
  },
  firstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
  },
  row: {
    gap: 8,
    paddingHorizontal: 14,
    paddingRight: 4,
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginLeft: 2,
    ...shadow('sm'),
  },
  filterBtnText: {
    fontSize: 18,
    color: Brand.primaryText,
  },
  filterBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Brand.primary,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  subRow: {
    gap: 8,
    paddingHorizontal: 14,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: 'rgba(255,255,255,0.96)',
    ...shadow('sm'),
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  chipTextActive: {
    color: '#ffffff',
  },
  subChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
    ...shadow('sm'),
  },
  subChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  subChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  subChipTextActive: {
    color: '#ffffff',
  },
});
