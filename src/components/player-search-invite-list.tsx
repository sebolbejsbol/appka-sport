import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/text-field';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { searchProfiles, type ProfileSearchHit } from '@/lib/social';
import { inviteToTeam } from '@/lib/teams';

type Props = {
  teamId: string;
  /** Wywołane po udanym wysłaniu zaproszenia — np. do odświeżenia składu drużyny w kreatorze. */
  onInvited?: (userId: string) => void;
};

/**
 * Wyszukiwarka graczy po nicku + wysyłanie zaproszeń do drużyny — dokładnie
 * ta sama logika co w standalone /teams/[id]/invite (stąd wydzielenie), teraz
 * reużywana też jako krok kreatora drużyny turniejowej (build-team.tsx).
 * Renderuje własną FlatList — NIE osadzać wewnątrz ScrollView (zagnieżdżone
 * VirtualizedList), rodzic powinien dać jej po prostu dostępną przestrzeń flex.
 */
export function PlayerSearchInviteList({ teamId, onInvited }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await searchProfiles(q);
    setResults(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (query.trim().length >= 2) void runSearch(query);
    }, [query, runSearch]),
  );

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
        onChangeText={(text) => {
          setQuery(text);
          void runSearch(text);
        }}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.user_id}
          style={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim().length < 2 ? t('social.searchHint') : t('social.emptySearch')}
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
