import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { divisionName, divisionProgress } from '@/lib/ranking';

type Props = {
  xp: number;
  rank: number;
  total: number;
  onPress?: () => void;
};

export function RankCard({ xp, rank, total, onPress }: Props) {
  const { division, next, progress, xpToNext } = divisionProgress(xp);

  const progressNote = next
    ? t('ranking.nextDivision')
        .replace('{name}', divisionName(next))
        .replace('{xp}', String(xpToNext))
    : t('ranking.maxDivision');

  const rankOf = t('ranking.rankOf').replace('{total}', String(total || 1));

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && onPress ? styles.pressed : null]}>
      <View style={[styles.glow, { backgroundColor: division.color }]} />

      <View style={styles.topRow}>
        <View style={[styles.emblem, { backgroundColor: division.color }]}>
          <Text style={styles.emblemEmoji}>{division.emoji}</Text>
        </View>

        <View style={styles.headText}>
          <Text style={styles.divisionLabel}>{t('ranking.division')}</Text>
          <Text style={styles.divisionName}>{divisionName(division)}</Text>
        </View>

        <View style={styles.rankPill}>
          <Text style={styles.rankHash}>#{rank || '—'}</Text>
          <Text style={styles.rankOf}>{rankOf}</Text>
        </View>
      </View>

      <View style={styles.xpRow}>
        <Text style={styles.xpValue}>{xp}</Text>
        <Text style={styles.xpUnit}>XP</Text>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(progress * 100)}%`, backgroundColor: division.color },
          ]}
        />
      </View>
      <Text style={styles.progressNote}>{progressNote}</Text>

      {onPress ? <Text style={styles.cta}>{t('ranking.seeRanking')} ›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0f172a',
    borderRadius: Radius.xl,
    padding: 18,
    overflow: 'hidden',
    marginBottom: 20,
    ...shadow('md'),
  },
  pressed: {
    opacity: 0.92,
  },
  glow: {
    position: 'absolute',
    right: -50,
    top: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.32,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  emblem: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemEmoji: {
    fontSize: 30,
  },
  headText: {
    flex: 1,
  },
  divisionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  divisionName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  rankPill: {
    alignItems: 'flex-end',
  },
  rankHash: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  rankOf: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 16,
    marginBottom: 10,
  },
  xpValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 32,
  },
  xpUnit: {
    fontSize: 14,
    fontWeight: '800',
    color: '#cbd5e1',
    marginBottom: 4,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },
  progressNote: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 8,
  },
  cta: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8ab4ff',
    marginTop: 12,
  },
});
