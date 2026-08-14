import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';

type Props = {
  bottomOffset: number;
  activeCount: number;
  loading?: boolean;
  onPress: () => void;
};

/**
 * Zastępuje dawny poziomy pasek kategorii (Sport/Hobby/Rekreacja/...) —
 * apka skupia się teraz na sporcie, więc zamiast wyboru kategorii jest jeden,
 * wyraźny pasek wyszukiwania otwierający pełny arkusz filtrów (dyscyplina,
 * lokalizacja, promień, data, liczba graczy, poziom). Zakotwiczony na dole
 * (nad dolnym paskiem nawigacji) — to główna akcja na mapie, więc ma być
 * pod kciukiem, a nie u góry ekranu.
 */
export function MapPlaySearchBar({ bottomOffset, activeCount, loading, onPress }: Props) {
  return (
    <View style={[styles.anchor, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.bar, pressed && styles.barPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('map.playSearchPlaceholder')}>
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>🔍</Text>
        </View>
        <View style={styles.textCol}>
          <Text style={styles.eyebrow}>{t('map.playSearchEyebrow')}</Text>
          <Text style={styles.placeholder} numberOfLines={1}>
            {t('map.playSearchPlaceholder')}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" color={Brand.primary} /> : null}
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 22,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    ...shadow('lg'),
  },
  barPressed: {
    opacity: 0.92,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 17,
  },
  textCol: {
    flex: 1,
    gap: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: Brand.textMuted,
    textTransform: 'uppercase',
  },
  placeholder: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '600',
    color: Brand.textMuted,
    paddingRight: 2,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: Brand.primaryText,
    fontSize: 12,
    fontWeight: '800',
  },
});
