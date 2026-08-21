import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { debounce, subscribeToTable } from '@/lib/realtime';
import {
  cancelFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  respondFriendRequest,
  type IncomingFriendRequest,
  type OutgoingFriendRequest,
  type SocialUserRow,
} from '@/lib/social';

type Tab = 'friends' | 'requests' | 'sent';

const VALID_TABS: Tab[] = ['friends', 'requests', 'sent'];

function UserRow({
  nick,
  avatarUrl,
  isOnline,
  onPress,
  trailing,
}: {
  nick: string | null;
  avatarUrl: string | null;
  isOnline?: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Animated.View entering={FadeIn.duration(220)} layout={LinearTransition.springify().damping(24).stiffness(220)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <UserAvatar nick={nick} avatarUrl={avatarUrl} size={48} showOnline isOnline={isOnline} />
        <View style={styles.rowMain}>
          <Text style={styles.rowName}>{nick?.trim() || t('common.nick')}</Text>
          {isOnline != null ? (
            <Text style={styles.rowMeta}>
              {isOnline ? t('social.online') : t('social.offline')}
            </Text>
          ) : null}
        </View>
        {trailing}
      </Pressable>
    </Animated.View>
  );
}

export default function FriendsListsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>('friends');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [friends, setFriends] = useState<SocialUserRow[]>([]);
  const [requests, setRequests] = useState<IncomingFriendRequest[]>([]);
  const [sent, setSent] = useState<OutgoingFriendRequest[]>([]);

  useEffect(() => {
    if (params.tab && VALID_TABS.includes(params.tab as Tab)) {
      setTab(params.tab as Tab);
    }
  }, [params.tab]);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    const [f, r, s] = await Promise.all([
      listFriends(),
      listIncomingFriendRequests(),
      listOutgoingFriendRequests(),
    ]);
    if (f.error || r.error || s.error) setLoadError(true);
    setFriends(f.data);
    setRequests(r.data);
    setSent(s.data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const reload = debounce(() => void refresh(true), 300);
    const unsubRequests = subscribeToTable('friend_requests', reload);
    const unsubFriendships = subscribeToTable('friendships', reload);
    return () => {
      unsubRequests();
      unsubFriendships();
    };
  }, [refresh]);

  async function handleRespond(requestId: string, accept: boolean) {
    await respondFriendRequest(requestId, accept);
    void refresh();
  }

  async function handleCancel(requestId: string) {
    setSent((prev) => prev.filter((r) => r.request_id !== requestId));
    await cancelFriendRequest(requestId);
    void refresh();
  }

  function openUser(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'friends', label: t('social.tabFriends') },
    { key: 'requests', label: t('social.tabRequests'), badge: requests.length },
    { key: 'sent', label: t('social.tabSent'), badge: sent.length },
  ];

  let listEmpty = t('social.emptyFriends');
  let listData: Array<{
    key: string;
    userId: string;
    nick: string | null;
    avatar_url: string | null;
    is_online?: boolean;
    requestId?: string;
    sentRequestId?: string;
  }> = [];

  if (tab === 'friends') {
    listData = friends.map((u) => ({
      key: u.user_id,
      userId: u.user_id,
      nick: u.nick,
      avatar_url: u.avatar_url,
      is_online: u.is_online,
    }));
  } else if (tab === 'sent') {
    listEmpty = t('social.emptySent');
    listData = sent.map((r) => ({
      key: r.request_id,
      userId: r.to_user_id,
      nick: r.nick,
      avatar_url: r.avatar_url,
      sentRequestId: r.request_id,
    }));
  } else {
    listEmpty = t('social.emptyRequests');
    listData = requests.map((r) => ({
      key: r.request_id,
      userId: r.from_user_id,
      nick: r.nick,
      avatar_url: r.avatar_url,
      requestId: r.request_id,
    }));
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('social.friendsTitle')}
        onBack={() => goBack('/social')}
        rightActions={[
          {
            key: 'search',
            icon: '⌕',
            accessibilityLabel: t('social.openSearch'),
            onPress: () => router.push('/social/search'),
          },
        ]}
      />

      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={[styles.tab, tab === item.key && styles.tabActive]}>
            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>
              {item.label}
              {item.badge ? ` (${item.badge})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.error}>{t('social.loadError')}</Text>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Text style={styles.emptyIconText}>🤝</Text>
              </View>
              <Text style={styles.empty}>{listEmpty}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <UserRow
              nick={item.nick}
              avatarUrl={item.avatar_url}
              isOnline={item.is_online}
              onPress={() => openUser(item.userId)}
              trailing={
                item.requestId ? (
                  <View style={styles.requestActions}>
                    <Pressable
                      onPress={() => void handleRespond(item.requestId!, true)}
                      style={styles.acceptBtn}>
                      <Text style={styles.acceptText}>{t('social.acceptRequest')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleRespond(item.requestId!, false)}
                      style={styles.rejectBtn}>
                      <Text style={styles.rejectText}>{t('social.rejectRequest')}</Text>
                    </Pressable>
                  </View>
                ) : item.sentRequestId ? (
                  <View style={styles.requestActions}>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingText}>{t('social.pendingRequest')}</Text>
                    </View>
                    <Pressable
                      onPress={() => void handleCancel(item.sentRequestId!)}
                      style={styles.rejectBtn}>
                      <Text style={styles.rejectText}>{t('social.cancelRequest')}</Text>
                    </Pressable>
                  </View>
                ) : null
              }
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
    backgroundColor: Brand.screenBackground,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  tabActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  tabText: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 13,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  tabTextActive: {
    color: Brand.primaryText,
  },
  loader: {
    marginTop: 32,
  },
  error: {
    fontFamily: BrandFonts.body,
    color: Brand.danger,
    marginTop: 24,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: {
    fontSize: 28,
  },
  empty: {
    fontFamily: BrandFonts.body,
    color: Brand.textSecondary,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
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
    gap: 2,
  },
  rowName: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  rowMeta: {
    fontFamily: BrandFonts.body,
    fontSize: 13,
    color: Brand.textMuted,
  },
  requestActions: {
    gap: 6,
    alignItems: 'flex-end',
  },
  acceptBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  acceptText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontSize: 12,
    fontWeight: '700',
  },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rejectText: {
    fontFamily: BrandFonts.body,
    color: Brand.textMuted,
    fontSize: 12,
  },
  pendingBadge: {
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingText: {
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
