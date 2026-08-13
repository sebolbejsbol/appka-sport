import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { listFriends, type SocialUserRow } from '@/lib/social';
import { inviteToTeam } from '@/lib/teams';

type Props = {
  teamId: string;
  /** user_id-y do wykluczenia z listy — już w drużynie albo już zaproszeni. */
  excludeUserIds: string[];
  onInvited?: (userId: string) => void;
  scrollEnabled?: boolean;
};

export function FriendInviteList({ teamId, excludeUserIds, onInvited, scrollEnabled = true }: Props) {
  const [friends, setFriends] = useState<SocialUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      void listFriends().then(({ data }) => {
        if (!cancelled) {
          setFriends(data);
          setLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds]);
  const visible = friends.filter((f) => {
    if (excluded.has(f.user_id)) return false;
    if (query.trim().length >= 2) {
      return (f.nick ?? '').toLowerCase().includes(query.trim().toLowerCase());
    }
    return true;
  });

  async function handleInvite(userId: string) {
    const result = await inviteToTeam(teamId, userId);
    if (result === 'sent' || result === 'request_pending' || result === 'already_member') {
      setSentTo((prev) => new Set(prev).add(userId));
      onInvited?.(userId);
    }
  }

  return (
    <View style={styles.container}>
      <TextField
        label={t('social.searchPlaceholder')}
        placeholder={t('social.searchPlaceholder')}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.user_id}
          style={styles.list}
          scrollEnabled={scrollEnabled}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {friends.length === 0 ? t('tournamentTeamRoster.noFriends') : t('social.emptySearch')}
            </Text>
          }
          renderItem={({ item }) => {
            const sent = sentTo.has(item.user_id);
            return (
              <View style={styles.row}>
                <Pressable
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } })}
                  style={styles.rowMain}>
                  <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={48} />
                  <Text style={styles.name}>{item.nick?.trim() || t('common.nick')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleInvite(item.user_id)}
                  disabled={sent}
                  style={[styles.inviteBtn, sent && styles.inviteBtnDisabled]}>
                  <Text style={styles.inviteText}>{sent ? t('teams.inviteSent') : t('teams.invite')}</Text>
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
  container: { flex: 1 },
  loader: { marginTop: 24 },
  list: { flex: 1 },
  empty: { textAlign: 'center', color: Brand.textMuted, marginTop: 32, paddingHorizontal: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
    gap: 8,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: Brand.textPrimary },
  inviteBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteText: { color: Brand.primaryText, fontSize: 13, fontWeight: '700' },
});
