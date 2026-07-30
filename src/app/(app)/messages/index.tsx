import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatListItem } from '@/components/chat-list-item';
import { ConversationAvatar } from '@/components/conversation-avatar';
import { ScreenHeader } from '@/components/screen-header';
import { Brand } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import {
  listConversationsV2,
  searchConversations,
  setConversationMuted,
  setConversationPinned,
  type ConversationListV2,
  type ConversationSearchResult,
} from '@/lib/messages';

export default function MessagesListScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myUserId = session?.user?.id;

  const [rows, setRows] = useState<ConversationListV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConversationSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    const { data, error: loadErr } = await listConversationsV2();
    setRows(data);
    setError(Boolean(loadErr));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const { data } = await searchConversations(text);
    setResults(data);
    setSearching(false);
  }, []);

  function openConversation(conversationId: string) {
    router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
  }

  function showActions(row: ConversationListV2) {
    Alert.alert(row.title?.trim() || t('chat.actionsTitle'), undefined, [
      {
        text: row.pinned ? t('chat.unpin') : t('chat.pin'),
        onPress: async () => {
          await setConversationPinned(row.conversation_id, !row.pinned);
          void refresh(true);
        },
      },
      {
        text: row.muted ? t('chat.unmute') : t('chat.mute'),
        onPress: async () => {
          await setConversationMuted(row.conversation_id, !row.muted);
          void refresh(true);
        },
      },
      { text: t('chat.cancel'), style: 'cancel' },
    ]);
  }

  const isSearchMode = query.trim().length > 0;
  const unreadConvos = rows.filter((r) => r.unread_count > 0).length;
  const subtitle =
    rows.length === 0
      ? undefined
      : unreadConvos > 0
        ? `${unreadConvos} nieprzeczytane`
        : `${rows.length}`;

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('messages.title')}
        subtitle={subtitle}
        rightActions={[
          {
            key: 'compose',
            icon: '✎',
            primary: true,
            accessibilityLabel: t('chat.newChat'),
            onPress: () => router.push({ pathname: '/social/search', params: { intent: 'message' } }),
          },
        ]}
      />

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={onSearch}
          placeholder={t('chat.searchPlaceholder')}
          placeholderTextColor={Brand.textMuted}
          style={styles.search}
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : isSearchMode ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.conversation_id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            searching ? (
              <ActivityIndicator color={Brand.primary} style={styles.loader} />
            ) : (
              <Text style={styles.empty}>{t('chat.noResults')}</Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openConversation(item.conversation_id)}
              style={({ pressed }) => [styles.resultRow, pressed && styles.pressed]}>
              <ConversationAvatar
                kind={item.kind}
                title={item.title}
                photoUrl={item.photo_url}
                size={48}
              />
              <Text style={styles.resultName} numberOfLines={1}>
                {item.title?.trim() || t('common.nick')}
              </Text>
            </Pressable>
          )}
        />
      ) : error || rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>💬</Text>
          </View>
          <Text style={styles.empty}>{t('chat.emptyList')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.conversation_id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void refresh(true);
              }}
              tintColor={Brand.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ChatListItem
              row={item}
              myUserId={myUserId}
              onPress={() => openConversation(item.conversation_id)}
              onLongPress={() => showActions(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.surface,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Brand.surface,
  },
  search: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: Brand.surfaceMuted,
    color: Brand.textPrimary,
    fontSize: 15,
  },
  list: {
    flex: 1,
    backgroundColor: Brand.surface,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#efefef',
    marginLeft: 84,
  },
  loader: {
    marginTop: 32,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 56,
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    fontSize: 32,
  },
  empty: {
    color: Brand.textMuted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 24,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Brand.surface,
  },
  resultName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  pressed: {
    backgroundColor: Brand.surfaceMuted,
  },
});
