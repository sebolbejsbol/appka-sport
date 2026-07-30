import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, Layout, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import {
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  type SocialUserRow,
} from '@/lib/social';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const [friends, setFriends] = useState<SocialUserRow[]>([]);
  const [incomingCount, setIncomingCount] = useState(0);
  const [outgoingCount, setOutgoingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const [f, inc, out] = await Promise.all([
      listFriends(),
      listIncomingFriendRequests(),
      listOutgoingFriendRequests(),
    ]);
    setFriends(f.data);
    setIncomingCount(inc.data.length);
    setOutgoingCount(out.data.length);
    setLoadError(Boolean(f.error));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  function openUser(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  function openInvites(tab: 'requests' | 'sent') {
    router.push({ pathname: '/social/friends', params: { tab } });
  }

  const trimmedQuery = query.trim().toLowerCase();
  const filteredFriends = useMemo(() => {
    if (!trimmedQuery) return friends;
    return friends.filter((f) => (f.nick ?? '').toLowerCase().includes(trimmedQuery));
  }, [friends, trimmedQuery]);

  const invitesHeader = (
    <View style={styles.invites}>
      <Pressable
        onPress={() => router.push('/social/search')}
        style={({ pressed }) => [styles.addFriendBtn, pressed && styles.pressed]}>
        <Text style={styles.addFriendIcon}>＋</Text>
        <Text style={styles.addFriendText}>{t('social.addFriend')}</Text>
      </Pressable>

      {friends.length > 0 ? (
        <View style={styles.friendSearch}>
          <Text style={styles.friendSearchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('social.searchFriendsPlaceholder')}
            placeholderTextColor={Brand.textMuted}
            style={styles.friendSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.friendSearchClear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => openInvites('requests')}
        style={({ pressed }) => [styles.inviteCard, pressed && styles.pressed]}>
        <Text style={styles.inviteIcon}>📨</Text>
        <View style={styles.inviteMain}>
          <Text style={styles.inviteTitle}>{t('social.tabRequests')}</Text>
          <Text style={styles.inviteMeta}>
            {incomingCount > 0
              ? `${incomingCount} ${t('social.pendingRequest').toLowerCase()}`
              : t('social.emptyRequests')}
          </Text>
        </View>
        {incomingCount > 0 ? (
          <View style={styles.inviteBadge}>
            <Text style={styles.inviteBadgeText}>{incomingCount}</Text>
          </View>
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => openInvites('sent')}
        style={({ pressed }) => [styles.inviteCard, pressed && styles.pressed]}>
        <Text style={styles.inviteIcon}>✈️</Text>
        <View style={styles.inviteMain}>
          <Text style={styles.inviteTitle}>{t('social.tabSent')}</Text>
          <Text style={styles.inviteMeta}>
            {outgoingCount > 0
              ? `${outgoingCount} ${t('social.pendingRequest').toLowerCase()}`
              : t('social.emptySent')}
          </Text>
        </View>
        {outgoingCount > 0 ? (
          <View style={[styles.inviteBadge, styles.inviteBadgeMuted]}>
            <Text style={styles.inviteBadgeText}>{outgoingCount}</Text>
          </View>
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </Pressable>
      {friends.length > 0 ? (
        <Text style={styles.sectionTitle}>{t('social.tabFriends')}</Text>
      ) : null}
    </View>
  );

  const onlineCount = friends.filter((f) => f.is_online).length;
  const subtitle =
    friends.length === 0
      ? undefined
      : onlineCount > 0
        ? `${friends.length} · ${onlineCount} online`
        : `${friends.length} ${friends.length === 1 ? 'znajomy' : 'znajomych'}`;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('social.friendsTitle')}
        subtitle={subtitle}
        rightActions={[
          {
            key: 'add',
            icon: '＋',
            primary: true,
            accessibilityLabel: t('social.addFriend'),
            onPress: () => router.push('/social/search'),
          },
        ]}
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.error}>{t('social.loadError')}</Text>
      ) : (
        <FlatList
          data={filteredFriends}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={invitesHeader}
          ListEmptyComponent={
            friends.length > 0 && trimmedQuery ? (
              <Text style={styles.noMatch}>{t('social.noFriendsMatch')}</Text>
            ) : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyIconText}>🤝</Text>
                </View>
                <Text style={styles.empty}>{t('social.emptyFriends')}</Text>
                <Pressable
                  onPress={() => router.push('/social/search')}
                  style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}>
                  <Text style={styles.emptyBtnText}>{t('social.addFriend')}</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openUser(item.user_id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <UserAvatar
                nick={item.nick}
                avatarUrl={item.avatar_url}
                size={52}
                showOnline
                isOnline={item.is_online}
              />
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.nick?.trim() || t('common.nick')}
                </Text>
                <View style={styles.statusRow}>
                  {item.is_online ? <View style={styles.onlineDot} /> : null}
                  <Text style={[styles.rowMeta, item.is_online && styles.rowMetaOnline]}>
                    {item.is_online ? t('social.online') : t('social.offline')}
                  </Text>
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  loader: {
    marginTop: 32,
  },
  error: {
    color: Brand.danger,
    marginTop: 24,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Layout.screenPaddingX,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 10,
  },
  invites: {
    gap: 10,
    marginBottom: 4,
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
    ...shadow('sm'),
  },
  addFriendIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: Brand.primaryText,
  },
  addFriendText: {
    fontSize: 15,
    fontWeight: '800',
    color: Brand.primaryText,
  },
  friendSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  friendSearchIcon: {
    fontSize: 20,
    color: Brand.textMuted,
  },
  friendSearchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: Brand.textPrimary,
  },
  friendSearchClear: {
    fontSize: 14,
    color: Brand.textMuted,
    paddingHorizontal: 4,
  },
  noMatch: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  inviteIcon: {
    fontSize: 22,
  },
  inviteMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  inviteTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  inviteMeta: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  inviteBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: Brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBadgeMuted: {
    backgroundColor: Brand.textMuted,
  },
  inviteBadgeText: {
    color: Brand.primaryText,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 56,
    paddingHorizontal: 24,
    gap: 14,
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
    color: Brand.textSecondary,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  emptyBtnText: {
    color: Brand.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  rowMain: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Brand.success,
  },
  rowMeta: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  rowMetaOnline: {
    color: Brand.success,
    fontWeight: '600',
  },
  chevron: {
    fontSize: 24,
    color: Brand.textMuted,
    marginLeft: 4,
  },
});
