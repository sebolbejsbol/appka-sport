import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { PlayerProfileCard } from '@/components/player-profile-card';
import { PostCard } from '@/components/post-card';
import { RankCard } from '@/components/rank-card';
import { getPlayerRank, type PlayerRank } from '@/lib/ranking';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatPlayedTogether } from '@/lib/plural-pl';
import { openDmConversation } from '@/lib/messages';
import { blockUser, reportUser, unblockUser, type ReportReason } from '@/lib/moderation';
import { goBack } from '@/lib/navigation';
import {
  applyLikeToggle,
  deletePost,
  listUserPosts,
  togglePostLike,
  type ProfilePost,
} from '@/lib/posts';
import { sharePost } from '@/lib/post-share';
import {
  getPublicProfile,
  removeFriend,
  sendFriendRequest,
  type PublicProfile,
} from '@/lib/social';

type Props = {
  userId: string;
  /** Główna zakładka (Mój profil) — bez strzałki wstecz. */
  isRootTab?: boolean;
};

function ProfileActionButton({
  label,
  primary,
  disabled,
  onPress,
}: {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        primary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text
        style={[
          styles.actionBtnText,
          primary ? styles.actionBtnTextPrimary : styles.actionBtnTextSecondary,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PublicProfileView({ userId, isRootTab = false }: Props) {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [rankInfo, setRankInfo] = useState<PlayerRank | null>(null);
  const [userPosts, setUserPosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [blocked, setBlocked] = useState<{ iBlockedThem: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setBlocked(null);
    const [profileResult, postsResult, rankResult] = await Promise.all([
      getPublicProfile(userId),
      listUserPosts(userId),
      getPlayerRank(userId),
    ]);

    if (profileResult.blocked) {
      setBlocked(profileResult.blocked);
      setProfile(null);
      setUserPosts([]);
      setRankInfo(null);
      setError(false);
      setLoading(false);
      return;
    }

    setProfile(profileResult.data);
    setRankInfo(rankResult.data);
    setUserPosts(postsResult.data);
    setError(Boolean(profileResult.error) || !profileResult.data);
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    await action();
    await load();
    setBusy(false);
  }

  const displayName = profile?.nick?.trim() || t('common.nick');
  const ratingText =
    profile?.avg_rating != null ? profile.avg_rating.toFixed(1) : t('social.noRating');

  function profileStatusText(p: PublicProfile): string {
    const parts: string[] = [];
    if (p.is_friend) parts.push(t('social.isFriend'));
    if (p.events_together > 0) parts.push(formatPlayedTogether(p.events_together));
    parts.push(p.is_online ? t('social.online') : t('social.offline'));
    return parts.join(' · ');
  }

  function openSocialTab(tab: 'friends') {
    router.push({ pathname: '/social/friends', params: { tab } });
  }

  function openUser(targetUserId: string) {
    if (targetUserId === userId) return;
    router.push({ pathname: '/user/[id]', params: { id: targetUserId } });
  }

  function openPost(postId: string) {
    router.push({ pathname: '/feed/post/[id]', params: { id: postId } });
  }

  function handleDeletePost(post: ProfilePost) {
    Alert.alert(t('feed.deletePostTitle'), t('feed.deletePostBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('feed.deletePostAction'),
        style: 'destructive',
        onPress: async () => {
          const result = await deletePost(post.post_id);
          if (result !== 'deleted') {
            Alert.alert(t('feed.deletePostFailed'));
            return;
          }
          setUserPosts((prev) => prev.filter((p) => p.post_id !== post.post_id));
        },
      },
    ]);
  }

  async function handleLike(post: ProfilePost) {
    setLikeBusyId(post.post_id);
    const result = await togglePostLike(post.post_id);
    setLikeBusyId(null);
    if (result === 'liked' || result === 'unliked') {
      setUserPosts((prev) =>
        prev.map((item) =>
          item.post_id === post.post_id
            ? { ...item, ...applyLikeToggle(item, result) }
            : item,
        ),
      );
    }
  }

  function handleBlock() {
    Alert.alert(t('moderation.blockConfirmTitle'), t('moderation.blockConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('moderation.blockAction'),
        style: 'destructive',
        onPress: () =>
          void runAction(async () => {
            const result = await blockUser(userId);
            if (result !== 'blocked') {
              Alert.alert(t('moderation.blockFailed'));
              return;
            }
            Alert.alert(t('moderation.blockDone'));
          }),
      },
    ]);
  }

  function handleUnblock() {
    void runAction(async () => {
      const result = await unblockUser(userId);
      if (result !== 'unblocked') {
        Alert.alert(t('moderation.unblockFailed'));
        return;
      }
      Alert.alert(t('moderation.unblockDone'));
    });
  }

  function submitReport(reason: ReportReason) {
    void runAction(async () => {
      const result = await reportUser(userId, reason);
      if (result !== 'reported') {
        Alert.alert(t('moderation.reportFailed'));
        return;
      }
      Alert.alert(t('moderation.reportSent'));
    });
  }

  function handleReport() {
    Alert.alert(t('moderation.reportTitle'), t('moderation.reportPickReason'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('moderation.reasonSpam'), onPress: () => submitReport('spam') },
      { text: t('moderation.reasonHarassment'), onPress: () => submitReport('harassment') },
      {
        text: t('moderation.reasonInappropriate'),
        onPress: () => submitReport('inappropriate'),
      },
      { text: t('moderation.reasonOther'), onPress: () => submitReport('other') },
    ]);
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={loading ? t('social.profileTitle') : displayName}
        onBack={isRootTab ? undefined : () => goBack('/')}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {loading ? (
          <ActivityIndicator color={Brand.primary} style={styles.loader} />
        ) : blocked ? (
          <View style={styles.blockedWrap}>
            <Text style={styles.blockedTitle}>{t('moderation.blockedTitle')}</Text>
            <Text style={styles.blockedBody}>{t('moderation.blockedBody')}</Text>
            {blocked.iBlockedThem ? (
              <ProfileActionButton
                label={t('moderation.unblock')}
                primary
                disabled={busy}
                onPress={handleUnblock}
              />
            ) : null}
          </View>
        ) : error || !profile ? (
          <Text style={styles.error}>{t('social.loadError')}</Text>
        ) : (
          <>
            <PlayerProfileCard
              profile={profile}
              displayName={displayName}
              ratingText={ratingText}
              statusText={
                profile.is_self
                  ? profile.is_online
                    ? t('social.online')
                    : t('social.offline')
                  : profileStatusText(profile)
              }
              onSocialPress={profile.is_self ? openSocialTab : undefined}
              onAvatarPress={
                profile.is_self ? () => router.push('/profile/edit') : undefined
              }
            />

            {rankInfo ? (
              <RankCard
                xp={rankInfo.xp}
                rank={rankInfo.rank}
                total={rankInfo.total}
                onPress={() => router.push('/ranking' as Href)}
              />
            ) : null}

            {profile.is_self ? (
              <View style={styles.actionsRow}>
                <ProfileActionButton
                  label={t('profile.editProfile')}
                  primary
                  onPress={() => router.push('/profile/edit')}
                />
                <ProfileActionButton
                  label={t('social.openSearch')}
                  onPress={() => router.push('/social/search')}
                />
              </View>
            ) : (
              <View style={styles.actionsRow}>
                {profile.is_friend ? (
                  <ProfileActionButton
                    label={t('social.removeFriend')}
                    disabled={busy}
                    onPress={() => runAction(() => removeFriend(userId))}
                  />
                ) : profile.friend_request_status === 'sent' ? (
                  <ProfileActionButton label={t('social.requestSent')} disabled onPress={() => {}} />
                ) : profile.friend_request_status === 'received' ? (
                  <ProfileActionButton
                    label={t('social.acceptRequest')}
                    primary
                    onPress={() =>
                      router.push({ pathname: '/social/friends', params: { tab: 'requests' } })
                    }
                  />
                ) : (
                  <ProfileActionButton
                    label={t('social.addFriend')}
                    primary
                    disabled={busy}
                    onPress={() => runAction(() => sendFriendRequest(userId))}
                  />
                )}

                <ProfileActionButton
                  label={t('social.message')}
                  primary={profile.can_message}
                  disabled={busy || !profile.can_message}
                  onPress={() =>
                    runAction(async () => {
                      const { data: convId } = await openDmConversation(userId);
                      if (convId) {
                        router.push({ pathname: '/messages/[id]', params: { id: convId } });
                      }
                    })
                  }
                />
                {!profile.can_message ? (
                  <Text style={styles.messageHint}>{t('social.messageHint')}</Text>
                ) : null}

                <Text style={styles.moderationTitle}>{t('moderation.moreActions')}</Text>
                <View style={styles.moderationRow}>
                  <Pressable
                    onPress={handleReport}
                    disabled={busy}
                    style={({ pressed }) => [styles.moderationBtn, pressed && styles.pressed]}>
                    <Text style={styles.moderationBtnText}>{t('moderation.report')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleBlock}
                    disabled={busy}
                    style={({ pressed }) => [
                      styles.moderationBtn,
                      styles.moderationBtnDanger,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.moderationBtnText, styles.moderationBtnTextDanger]}>
                      {t('moderation.block')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={[styles.sectionTitle, styles.postsSectionTitle]}>
              {t('social.userPosts')}
            </Text>
            {userPosts.length === 0 ? (
              <Text style={styles.emptyPosts}>{t('social.emptyUserPosts')}</Text>
            ) : (
              userPosts.map((post) => (
                <PostCard
                  key={post.post_id}
                  postId={post.post_id}
                  authorId={post.author_id}
                  authorNick={post.author_nick}
                  authorAvatarUrl={post.author_avatar_url}
                  body={post.body}
                  createdAt={post.created_at}
                  isFriend={profile.is_friend}
                  likeCount={post.like_count}
                  commentCount={post.comment_count}
                  isLiked={post.is_liked}
                  likeBusy={likeBusyId === post.post_id}
                  isMine={post.is_mine}
                  mentions={post.mentions}
                  media={post.media}
                  onAuthorPress={openUser}
                  onMentionPress={openUser}
                  onLikePress={() => void handleLike(post)}
                  onCommentPress={() => openPost(post.post_id)}
                  onSharePress={() => void sharePost(post)}
                  onBodyPress={() => openPost(post.post_id)}
                  onDeletePress={() => handleDeletePost(post)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  content: {
    paddingHorizontal: 20,
  },
  loader: {
    marginTop: 40,
  },
  error: {
    color: Brand.danger,
    fontSize: 15,
    marginTop: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  statsGrid: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: Brand.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  identity: {
    marginBottom: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  status: {
    fontSize: 14,
    color: Brand.textMuted,
    marginTop: 2,
    lineHeight: 20,
  },
  messageHint: {
    flexBasis: '100%',
    fontSize: 13,
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  extraStats: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 24,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Brand.border,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: Brand.primary,
  },
  actionBtnSecondary: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionBtnTextPrimary: {
    color: Brand.primaryText,
  },
  actionBtnTextSecondary: {
    color: Brand.textPrimary,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  postsSectionTitle: {
    marginTop: 8,
    marginBottom: 4,
  },
  emptyPosts: {
    color: Brand.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  blockedWrap: {
    marginTop: 32,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 12,
  },
  blockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Brand.textPrimary,
    textAlign: 'center',
  },
  blockedBody: {
    fontSize: 15,
    lineHeight: 22,
    color: Brand.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  moderationTitle: {
    width: '100%',
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  moderationRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moderationBtn: {
    flexGrow: 1,
    minWidth: 140,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    alignItems: 'center',
  },
  moderationBtnDanger: {
    borderColor: '#f5c2c2',
    backgroundColor: '#fff5f5',
  },
  moderationBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  moderationBtnTextDanger: {
    color: Brand.danger,
  },
});
