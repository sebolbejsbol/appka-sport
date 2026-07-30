import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import { formatCourtName } from '@/lib/field-display';
import {
  getMyEventsPendingFieldRating,
  type PendingFieldRatingEvent,
} from '@/lib/pending-field-ratings';
import { polishPlural } from '@/lib/plural-pl';

type Props = {
  onChanged?: () => void;
  refreshKey?: number;
};

export function PendingFieldRatingsBanner({ onChanged, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<PendingFieldRatingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getMyEventsPendingFieldRating();
    if (!error) setItems(data);
    setLoading(false);
    onChanged?.();
  }, [onChanged]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return <ActivityIndicator color={Brand.primary} style={styles.loader} />;
  }

  if (items.length === 0) return null;

  const countLabel = (() => {
    const n = items.length;
    const word = polishPlural(n, 'boisko', 'boiska', 'boisk');
    return `${n} ${word}`;
  })();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('fieldRatings.pendingTitle')}</Text>
      <Text style={styles.subtitle}>{t('fieldRatings.pendingSubtitle').replace('{count}', countLabel)}</Text>
      {items.map((item) => (
        <Pressable
          key={item.event_id}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={() =>
            router.push({
              pathname: '/event/[id]',
              params: { id: item.event_id },
            })
          }>
          <Text style={styles.court}>{formatCourtName(item.field_name)}</Text>
          <Text style={styles.meta}>
            {formatEventDateTime(item.starts_at)}
            {item.title?.trim() ? ` · ${item.title.trim()}` : ''}
          </Text>
          <Text style={styles.link}>{t('fieldRatings.pendingAction')} ›</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginVertical: 8,
  },
  card: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Brand.textSecondary,
    marginBottom: 4,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
    gap: 2,
  },
  court: {
    fontSize: 15,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  meta: {
    fontSize: 13,
    color: Brand.textSecondary,
  },
  link: {
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primary,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.85,
  },
});
