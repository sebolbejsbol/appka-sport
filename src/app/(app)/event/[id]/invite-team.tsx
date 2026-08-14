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
import { inviteTeamToEvent, listMyTeams, type TeamListItem } from '@/lib/teams';

export default function InviteTeamToEventScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = params.id;

  const [teams, setTeams] = useState<TeamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await listMyTeams();
    setTeams(data.filter((team) => team.my_role === 'owner' || team.my_role === 'admin'));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite(teamId: string) {
    if (!eventId) return;
    const result = await inviteTeamToEvent(eventId, teamId);
    if (result === 'ok' || result === 'already_invited') {
      setSent((prev) => new Set(prev).add(teamId));
    }
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('teams.eventInviteTitle')}
        onBack={() => goBack(eventId ? `/event/${eventId}` : '/events')}
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={teams}
          keyExtractor={(item) => item.team_id}
          contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 }}
          ListEmptyComponent={<Text style={styles.empty}>{t('teams.eventInviteEmpty')}</Text>}
          renderItem={({ item }) => {
            const done = sent.has(item.team_id);
            return (
              <View style={styles.row}>
                <TeamAvatar name={item.name} logoUrl={item.logo_url} size={48} />
                <Text style={styles.name}>{item.name}</Text>
                <Pressable
                  onPress={() => void handleInvite(item.team_id)}
                  disabled={done}
                  style={[styles.btn, done && styles.btnDisabled]}>
                  <Text style={styles.btnText}>
                    {done ? t('teams.inviteSent') : t('teams.eventInviteAction')}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  empty: { textAlign: 'center', color: Brand.textMuted, marginTop: 32, paddingHorizontal: 24 },
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
  btn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: Brand.primaryText, fontSize: 12, fontWeight: '700' },
});
