import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { ChatListItem } from '@/components/chat-list-item';
import { ConversationAvatar } from '@/components/conversation-avatar';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { showActionSheet } from '@/lib/action-sheet-navigation';
import {
  openDmConversation,
  listConversationsV2,
  searchConversations,
  setConversationMuted,
  setConversationPinned,
  type ConversationListV2,
  type ConversationSearchResult,
} from '@/lib/messages';
import { debounce, subscribeToTable } from '@/lib/realtime';
import { listFriends, type SocialUserRow } from '@/lib/social';
import { notifyError } from '@/lib/toast';

type SearchResultItem = ConversationSearchResult & { pending?: boolean };

export default function MessagesListScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myUserId = session?.user?.id;

  const [rows, setRows] = useState<ConversationListV2[]>([]);
  const [friends, setFriends] = useState<SocialUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [openingUserId, setOpeningUserId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    const [{ data, error: loadErr }, { data: friendsData }] = await Promise.all([
      listConversationsV2(),
      listFriends(),
    ]);
    setRows(data);
    setFriends(friendsData);
    setError(Boolean(loadErr));
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Znajomi, którzy jeszcze nie mają rozmowy — bez tego nowy znajomy w ogóle
  // nie pojawiał się w Wiadomościach, dopóki ktoś nie napisał pierwszej
  // wiadomości (open_dm_conversation tworzy rozmowę leniwie, nie przy zaprzyjaźnieniu).
  const friendsWithoutConversation = friends.filter(
    (f) => !rows.some((r) => r.other_user_id === f.user_id),
  );

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const reload = debounce(() => void refresh(true), 300);
    const unsubMessages = subscribeToTable('messages', reload, { event: 'INSERT' });
    const unsubMembers = subscribeToTable('conversation_members', reload, { event: 'UPDATE' });
    // Zabezpieczenie na wypadek gdyby realtime nie dotarł.
    const pollId = setInterval(() => void refresh(true), 4000);
    return () => {
      unsubMessages();
      unsubMembers();
      clearInterval(pollId);
    };
  }, [refresh]);

  const onSearch = useCallback(
    async (text: string) => {
      setQuery(text);
      if (!text.trim()) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const { data } = await searchConversations(text);
      // "Szukaj rozmów" ma zwracać WSZYSTKICH znajomych, nie tylko tych, z
      // którymi już jest jakaś rozmowa — inaczej świeżo dodany znajomy był
      // nieosiągalny przez wyszukiwarkę, dopóki ktoś nie napisał pierwszy.
      const term = text.trim().toLowerCase();
      const matchedUserIds = new Set(data.map((r) => r.other_user_id).filter(Boolean));
      const friendMatches: SearchResultItem[] = friends
        .filter(
          (f) => !matchedUserIds.has(f.user_id) && (f.nick ?? '').toLowerCase().includes(term),
        )
        .map((f) => ({
          conversation_id: f.user_id,
          kind: 'dm',
          title: f.nick,
          photo_url: f.avatar_url,
          other_user_id: f.user_id,
          pending: true,
        }));
      setResults([...data, ...friendMatches]);
      setSearching(false);
    },
    [friends],
  );

  function openConversation(conversationId: string) {
    router.push({ pathname: '/messages/[id]', params: { id: conversationId } });
  }

  async function openConversationWithFriend(userId: string) {
    if (openingUserId) return;
    setOpeningUserId(userId);
    const { data: conversationId } = await openDmConversation(userId);
    setOpeningUserId(null);
    if (!conversationId) {
      notifyError(t('chat.openFailed'));
      return;
    }
    openConversation(conversationId);
  }

  function openSearchResult(item: SearchResultItem) {
    if (item.pending && item.other_user_id) {
      void openConversationWithFriend(item.other_user_id);
      return;
    }
    openConversation(item.conversation_id);
  }

  function showActions(row: ConversationListV2) {
    showActionSheet({
      title: row.title?.trim() || t('chat.actionsTitle'),
      cancelLabel: t('chat.cancel'),
      options: [
        {
          label: row.pinned ? t('chat.unpin') : t('chat.pin'),
          onPress: () =>
            void (async () => {
              await setConversationPinned(row.conversation_id, !row.pinned);
              void refresh(true);
            })(),
        },
        {
          label: row.muted ? t('chat.unmute') : t('chat.mute'),
          onPress: () =>
            void (async () => {
              await setConversationMuted(row.conversation_id, !row.muted);
              void refresh(true);
            })(),
        },
      ],
    });
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
      <ScreenHeader insetTop={insets.top} title={t('messages.title')} subtitle={subtitle} />

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
          contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 16 }}
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
              onPress={() => openSearchResult(item)}
              disabled={openingUserId === item.other_user_id}
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
              {item.pending ? (
                openingUserId === item.other_user_id ? (
                  <ActivityIndicator color={Brand.primary} />
                ) : (
                  <Text style={styles.sayHiHint}>{t('chat.sayHi')}</Text>
                )
              ) : null}
            </Pressable>
          )}
        />
      ) : error || (rows.length === 0 && friendsWithoutConversation.length === 0) ? (
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
          contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 16 }}
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
          ListHeaderComponent={
            friendsWithoutConversation.length > 0 ? (
              <View style={styles.friendsSection}>
                <Text style={styles.friendsSectionTitle}>{t('chat.friendsSectionTitle')}</Text>
                {friendsWithoutConversation.map((f) => (
                  <Pressable
                    key={f.user_id}
                    onPress={() => void openConversationWithFriend(f.user_id)}
                    disabled={openingUserId === f.user_id}
                    style={({ pressed }) => [styles.friendRow, pressed && styles.pressed]}>
                    <ConversationAvatar
                      kind="dm"
                      title={f.nick}
                      photoUrl={f.avatar_url}
                      isOnline={f.is_online}
                      size={48}
                    />
                    <Text style={styles.friendName} numberOfLines={1}>
                      {f.nick?.trim() || t('common.nick')}
                    </Text>
                    {openingUserId === f.user_id ? (
                      <ActivityIndicator color={Brand.primary} />
                    ) : (
                      <Text style={styles.sayHiAction}>{t('chat.sayHi')}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            ) : null
          }
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
    fontFamily: BrandFonts.body,
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
    fontFamily: BrandFonts.body,
    fontSize: 32,
  },
  empty: {
    fontFamily: BrandFonts.body,
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
    fontFamily: BrandFonts.bodySemibold,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  sayHiHint: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.primary,
  },
  friendsSection: {
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#efefef',
  },
  friendsSectionTitle: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  friendName: {
    fontFamily: BrandFonts.bodySemibold,
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  sayHiAction: {
    fontFamily: BrandFonts.bodyBold,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.primary,
  },
  pressed: {
    backgroundColor: Brand.surfaceMuted,
  },
});
