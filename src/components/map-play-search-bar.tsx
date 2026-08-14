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
        <Text style={styles.icon}>🔍</Text>
        <Text style={styles.placeholder} numberOfLines={1}>
          {t('map.playSearchPlaceholder')}
        </Text>
        {loading ? <ActivityIndicator size="small" color={Brand.primary} /> : null}
        {activeCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        ) : null}
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
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    ...shadow('md'),
  },
  barPressed: {
    opacity: 0.9,
  },
  icon: {
    fontSize: 16,
  },
  placeholder: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textSecondary,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
});
