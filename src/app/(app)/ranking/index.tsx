import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RankCard } from '@/components/rank-card';
import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import {
  divisionForXp,
  divisionName,
  getLeaderboard,
  getPlayerRank,
  type LeaderboardEntry,
  type PlayerRank,
} from '@/lib/ranking';

const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHTS = [96, 76, 64];

export default function RankingScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myId = session?.user?.id ?? null;

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<PlayerRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const [boardRes, rankRes] = await Promise.all([
      getLeaderboard(100),
      myId ? getPlayerRank(myId) : Promise.resolve({ data: null, error: null }),
    ]);
    setEntries(boardRes.data);
    setMyRank(rankRes.data);
    setError(Boolean(boardRes.error));
    setLoading(false);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('ranking.title')}
        subtitle={t('ranking.subtitle')}
        large
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{t('ranking.loadError')}</Text>
      ) : entries.length === 0 ? (
        <Text style={styles.empty}>{t('ranking.empty')}</Text>
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {top3.length > 0 ? <Podium top3={top3} myId={myId} /> : null}

              {myRank ? (
                <>
                  <Text style={styles.sectionTitle}>{t('ranking.yourPosition')}</Text>
                  <RankCard xp={myRank.xp} rank={myRank.rank} total={myRank.total} />
                </>
              ) : null}

              <View style={styles.howCard}>
                <Text style={styles.howTitle}>{t('ranking.howTitle')}</Text>
                <Text style={styles.howLine}>{t('ranking.howPlayed')}</Text>
                <Text style={styles.howLine}>{t('ranking.howCheckIn')}</Text>
                <Text style={[styles.howLine, styles.howLinePenalty]}>{t('ranking.howLate')}</Text>
              </View>

              {rest.length > 0 ? (
                <Text style={styles.sectionTitle}>{t('ranking.topPlayers')}</Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <PlayerRow entry={item} highlight={item.user_id === myId} />
          )}
        />
      )}
    </View>
  );
}

function Podium({ top3, myId }: { top3: LeaderboardEntry[]; myId: string | null }) {
  return (
    <View style={styles.podium}>
      {PODIUM_ORDER.map((idx, slot) => {
        const entry = top3[idx];
        if (!entry) return <View key={slot} style={styles.podiumSlot} />;
        const division = divisionForXp(entry.xp);
        const isMe = entry.user_id === myId;
        return (
          <Pressable
            key={entry.user_id}
            onPress={() => openUser(entry.user_id, myId)}
            style={({ pressed }) => [styles.podiumSlot, pressed && styles.pressed]}>
            <Text style={styles.podiumMedal}>
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
            </Text>
            <View style={[styles.podiumAvatar, { borderColor: division.color }]}>
              <UserAvatar nick={entry.nick} avatarUrl={entry.avatar_url} size={idx === 0 ? 64 : 52} />
            </View>
            <Text style={[styles.podiumName, isMe && styles.meText]} numberOfLines={1}>
              {entry.nick?.trim() || t('common.nick')}
            </Text>
            <Text style={[styles.podiumXp, { color: division.color }]}>{entry.xp} XP</Text>
            <View
              style={[
                styles.podiumBar,
                { height: PODIUM_HEIGHTS[slot], backgroundColor: division.color },
              ]}>
              <Text style={styles.podiumRank}>{idx + 1}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PlayerRow({ entry, highlight }: { entry: LeaderboardEntry; highlight: boolean }) {
  const division = divisionForXp(entry.xp);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: entry.user_id } })}
      style={({ pressed }) => [
        styles.row,
        highlight && styles.rowMe,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.rowRank, highlight && styles.meText]}>{entry.rank}</Text>
      <UserAvatar nick={entry.nick} avatarUrl={entry.avatar_url} size={44} />
      <View style={styles.rowMain}>
        <Text style={[styles.rowNick, highlight && styles.meText]} numberOfLines={1}>
          {entry.nick?.trim() || t('common.nick')}
        </Text>
        <View style={[styles.divBadge, { backgroundColor: division.tint }]}>
          <Text style={styles.divEmoji}>{division.emoji}</Text>
          <Text style={[styles.divName, { color: division.color }]}>{divisionName(division)}</Text>
        </View>
      </View>
      <View style={styles.rowXpWrap}>
        <Text style={styles.rowXp}>{entry.xp}</Text>
        <Text style={styles.rowXpUnit}>XP</Text>
      </View>
    </Pressable>
  );
}

function openUser(targetId: string, myId: string | null) {
  if (targetId === myId) {
    router.push('/profile');
    return;
  }
  router.push({ pathname: '/user/[id]', params: { id: targetId } });
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 48 },
  error: { color: Brand.danger, textAlign: 'center', marginTop: 32, fontSize: 15 },
  empty: { color: Brand.textMuted, textAlign: 'center', marginTop: 32, fontSize: 15 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 24,
    marginTop: 4,
  },
  podiumSlot: {
    flex: 1,
    alignItems: 'center',
  },
  podiumMedal: {
    fontSize: 22,
    marginBottom: 4,
  },
  podiumAvatar: {
    borderRadius: 999,
    borderWidth: 3,
    padding: 3,
    backgroundColor: Brand.surface,
  },
  podiumName: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 6,
    maxWidth: '100%',
  },
  podiumXp: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
    marginBottom: 8,
  },
  podiumBar: {
    width: '78%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  podiumRank: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
  },
  howCard: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 16,
    marginBottom: 20,
    gap: 6,
  },
  howTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Brand.textPrimary,
    marginBottom: 4,
  },
  howLine: {
    fontSize: 14,
    color: Brand.textSecondary,
  },
  howLinePenalty: {
    color: Brand.danger,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    ...shadow('sm'),
  },
  rowMe: {
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryLight,
  },
  rowRank: {
    width: 30,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    color: Brand.textMuted,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowNick: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  divBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  divEmoji: { fontSize: 12 },
  divName: { fontSize: 11, fontWeight: '800' },
  rowXpWrap: {
    alignItems: 'flex-end',
  },
  rowXp: {
    fontSize: 17,
    fontWeight: '900',
    color: Brand.textPrimary,
  },
  rowXpUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: Brand.textMuted,
  },
  meText: {
    color: Brand.primary,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
