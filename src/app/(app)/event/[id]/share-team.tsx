import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { ScreenHeader } from '@/components/screen-header';
import { TeamAvatar } from '@/components/team-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { listMyTeams, shareEventInTeamChat, type TeamListItem } from '@/lib/teams';

export default function ShareEventToTeamScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = params.id;

  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listMyTeams();
    setTeams(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleShare(teamId: string) {
    if (!eventId) return;
    const { messageId } = await shareEventInTeamChat(teamId, eventId);
    if (messageId) {
      setSent((prev) => new Set(prev).add(teamId));
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.shareEvent')}
        onBack={() => goBack(eventId ? `/event/${eventId}` : '/events')}
      />

      <Text style={styles.hint}>{t('teams.shareEventHint')}</Text>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.team_id}
          contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 }}
          ListEmptyComponent={<Text style={styles.empty}>{t('teams.empty')}</Text>}
          renderItem={({ item }) => {
            const done = sent.has(item.team_id);
            return (
              <Pressable
                onPress={() => void handleShare(item.team_id)}
                disabled={done}
                style={({ pressed }) => [styles.row, pressed && !done && styles.pressed]}>
                <TeamAvatar name={item.name} logoUrl={item.logo_url} size={48} />
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.status}>{done ? '✓' : t('teams.shareEvent')}</Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  hint: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: Brand.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', color: Brand.textMuted, marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: Brand.textPrimary },
  status: { color: Brand.primary, fontWeight: '700', fontSize: 13 },
  pressed: { opacity: 0.85 },
});
