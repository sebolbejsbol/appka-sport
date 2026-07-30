import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import type { BlockedCoPlayer } from '@/lib/events';

type Props = {
  blockedCoPlayers?: BlockedCoPlayer[];
  compact?: boolean;
};

export function EventBlockedCoPlayerBanner({ blockedCoPlayers, compact = false }: Props) {
  const players = blockedCoPlayers ?? [];
  if (players.length === 0) return null;

  const names = players
    .map((p) => p.nick?.trim() || t('common.nick'))
    .join(', ');

  return (
    <View style={[styles.banner, compact && styles.bannerCompact]}>
      <Text style={styles.title}>{t('event.blockedCoPlayerTitle')}</Text>
      <Text style={styles.body}>
        {t('event.blockedCoPlayerBody').replace('{names}', names)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff8e6',
    borderWidth: 1,
    borderColor: '#f0d080',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  bannerCompact: {
    marginTop: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8a5a00',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: Brand.textSecondary,
  },
});
