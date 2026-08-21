import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_NAV_HEIGHT } from '@/components/app-side-menu';
import { PostCard } from '@/components/post-card';
import { PostComposer } from '@/components/post-composer';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import type { PickedMedia } from '@/lib/pick-image';
import { uploadPostMedia } from '@/lib/post-media-storage';
import { sharePost } from '@/lib/post-share';
import {
  applyLikeToggle,
  createPost,
  deletePost,
  listFeedPosts,
  togglePostLike,
  type FeedPost,
} from '@/lib/posts';
import { notifyError } from '@/lib/toast';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(false);
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    const { data, error: loadErr } = await listFeedPosts();
    setPosts(data);
    setError(Boolean(loadErr));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function handlePost(body: string, media: PickedMedia[]) {
    if ((!body.trim() && media.length === 0) || posting) return;

    setPosting(true);
    setPostError(false);

    const { uploaded, error: uploadErr } = await uploadPostMedia(media);
    if (uploadErr) {
      setPosting(false);
      setPostError(true);
      return;
    }

    const { postId, error: createErr } = await createPost(body, uploaded);
    setPosting(false);

    if (createErr || !postId) {
      setPostError(true);
      return;
    }

    void refresh(true);
  }

  function openPost(postId: string) {
    router.push({ pathname: '/feed/post/[id]', params: { id: postId } });
  }

  async function handleLike(post: FeedPost) {
    setLikeBusyId(post.post_id);
    const result = await togglePostLike(post.post_id);
    setLikeBusyId(null);
    if (result === 'liked' || result === 'unliked') {
      setPosts((prev) =>
        prev.map((item) =>
          item.post_id === post.post_id
            ? { ...item, ...applyLikeToggle(item, result) }
            : item,
        ),
      );
    }
  }

  function openUser(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  function handleDeletePost(post: FeedPost) {
    confirmAction(
      t('feed.deletePostTitle'),
      t('feed.deletePostBody'),
      t('feed.deletePostAction'),
      t('common.cancel'),
      () =>
        void (async () => {
          const result = await deletePost(post.post_id);
          if (result !== 'deleted') {
            notifyError(t('feed.deletePostFailed'));
            return;
          }
          setPosts((prev) => prev.filter((p) => p.post_id !== post.post_id));
        })(),
      true,
    );
  }

  function openDiscover() {
    router.push('/social/search');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <View style={styles.flex}>
        <ScreenHeader
          insetTop={insets.top}
          title={t('feed.title')}
          subtitle={t('feed.subtitle')}
        />

        <PostComposer posting={posting} postError={postError} onSubmit={handlePost} />

        {loading ? (
          <ActivityIndicator color={Brand.primary} style={styles.loader} />
        ) : error ? (
          <Text style={styles.empty}>{t('feed.loadError')}</Text>
        ) : posts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>📣</Text>
            </View>
            <Text style={styles.empty}>{t('feed.empty')}</Text>
            <Text style={styles.emptyHint}>{t('feed.emptyHint')}</Text>
            <Pressable
              onPress={openDiscover}
              style={({ pressed }) => [styles.discoverBtn, pressed && styles.pressed]}>
              <Text style={styles.discoverBtnText}>{t('feed.discoverPlayers')}</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.post_id}
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
            contentContainerStyle={{ paddingBottom: insets.bottom + BOTTOM_NAV_HEIGHT + 24 }}
            renderItem={({ item }) => (
              <PostCard
                postId={item.post_id}
                authorId={item.author_id}
                authorNick={item.author_nick}
                authorAvatarUrl={item.author_avatar_url}
                body={item.body}
                createdAt={item.created_at}
                isFriend={item.author_is_friend}
                likeCount={item.like_count}
                commentCount={item.comment_count}
                isLiked={item.is_liked}
                likeBusy={likeBusyId === item.post_id}
                isMine={item.is_mine}
                mentions={item.mentions}
                media={item.media}
                onAuthorPress={openUser}
                onMentionPress={openUser}
                onLikePress={() => void handleLike(item)}
                onCommentPress={() => openPost(item.post_id)}
                onSharePress={() => void sharePost(item)}
                onBodyPress={() => openPost(item.post_id)}
                onDeletePress={() => handleDeletePost(item)}
              />
            )}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  loader: {
    marginTop: 32,
  },
  emptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 44,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Brand.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconText: {
    fontSize: 32,
  },
  empty: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.textPrimary,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  emptyHint: {
    fontFamily: BrandFonts.body,
    color: Brand.textMuted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  discoverBtn: {
    marginTop: 12,
    backgroundColor: Brand.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    ...shadow('sm'),
  },
  discoverBtnText: {
    fontFamily: BrandFonts.bodyBold,
    color: Brand.primaryText,
    fontWeight: '700',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
});
