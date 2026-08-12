import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PostCard } from '@/components/post-card';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { formatRelativeShortTime } from '@/lib/datetime';
import { goBack } from '@/lib/navigation';
import { sharePost } from '@/lib/post-share';
import {
  applyLikeToggle,
  createPostComment,
  deletePost,
  deletePostComment,
  getPostDetail,
  listPostComments,
  togglePostLike,
  type PostComment,
  type PostDetail,
} from '@/lib/posts';
import { notifyError } from '@/lib/toast';

const MAX_COMMENT_LENGTH = 500;

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = id ?? '';

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ parentId: string; nick: string } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoadError(false);
    const [detailResult, commentsResult] = await Promise.all([
      getPostDetail(postId),
      listPostComments(postId),
    ]);
    setPost(detailResult.data);
    setComments(commentsResult.data);
    setLoadError(Boolean(detailResult.error) || !detailResult.data);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLike() {
    if (!post || likeBusy) return;
    setLikeBusy(true);
    const result = await togglePostLike(post.post_id);
    setLikeBusy(false);
    if (result === 'liked' || result === 'unliked') {
      setPost((prev) => (prev ? { ...prev, ...applyLikeToggle(prev, result) } : prev));
    }
  }

  async function handleComment() {
    const body = draft.trim();
    if (!post || !body || posting) return;

    setPosting(true);
    setPostError(false);
    const { commentId, error } = await createPostComment(
      post.post_id,
      body,
      replyingTo?.parentId ?? null,
    );
    setPosting(false);

    if (error || !commentId) {
      setPostError(true);
      return;
    }

    setDraft('');
    setReplyingTo(null);
    setPost((prev) =>
      prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev,
    );
    void load();
  }

  function startReply(comment: PostComment) {
    setReplyingTo({
      parentId: comment.comment_id,
      nick: comment.author_nick?.trim() || t('common.nick'),
    });
    inputRef.current?.focus();
  }

  function handleDeletePost() {
    if (!post) return;
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
          goBack('/feed');
        })(),
      true,
    );
  }

  function handleDeleteComment(comment: PostComment) {
    confirmAction(
      t('feed.deleteCommentTitle'),
      t('feed.deleteCommentBody'),
      t('feed.deleteCommentAction'),
      t('common.cancel'),
      () =>
        void (async () => {
          const result = await deletePostComment(comment.comment_id);
          if (result !== 'deleted') {
            notifyError(t('feed.deleteCommentFailed'));
            return;
          }
          setComments((prev) => prev.filter((c) => c.comment_id !== comment.comment_id));
          setPost((prev) =>
            prev
              ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) }
              : prev,
          );
        })(),
      true,
    );
  }

  function openUser(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  const canComment = draft.trim().length > 0 && !posting;

  // Wątki: komentarze najwyższego poziomu, a pod każdym jego odpowiedzi.
  const threadedComments = useMemo(() => {
    const repliesByParent = new Map<string, PostComment[]>();
    for (const c of comments) {
      if (c.parent_id) {
        const arr = repliesByParent.get(c.parent_id) ?? [];
        arr.push(c);
        repliesByParent.set(c.parent_id, arr);
      }
    }
    const out: { comment: PostComment; isReply: boolean }[] = [];
    for (const c of comments) {
      if (c.parent_id) continue;
      out.push({ comment: c, isReply: false });
      for (const reply of repliesByParent.get(c.comment_id) ?? []) {
        out.push({ comment: reply, isReply: true });
      }
    }
    return out;
  }, [comments]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => goBack('/feed')} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={Brand.primary} style={styles.loader} />
        ) : loadError || !post ? (
          <Text style={styles.error}>{t('feed.postNotFound')}</Text>
        ) : (
          <>
            <PostCard
              postId={post.post_id}
              authorId={post.author_id}
              authorNick={post.author_nick}
              authorAvatarUrl={post.author_avatar_url}
              body={post.body}
              createdAt={post.created_at}
              isFriend={post.author_is_friend}
              likeCount={post.like_count}
              commentCount={post.comment_count}
              isLiked={post.is_liked}
              likeBusy={likeBusy}
              mentions={post.mentions}
              media={post.media}
              isMine={post.is_mine}
              onAuthorPress={openUser}
              onMentionPress={openUser}
              onLikePress={() => void handleLike()}
              onSharePress={() => void sharePost(post)}
              onDeletePress={handleDeletePost}
            />

            <Text style={styles.sectionTitle}>{t('feed.commentsTitle')}</Text>

            <FlatList
              data={threadedComments}
              keyExtractor={(item) => item.comment.comment_id}
              contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={styles.emptyComments}>{t('feed.commentsEmpty')}</Text>
              }
              renderItem={({ item }) => (
                <CommentRow
                  comment={item.comment}
                  isReply={item.isReply}
                  onAuthorPress={openUser}
                  onReply={() => startReply(item.comment)}
                  onDelete={() => handleDeleteComment(item.comment)}
                />
              )}
            />

            <View style={[styles.composer, { paddingBottom: insets.bottom + 12 }]}>
              {replyingTo ? (
                <View style={styles.replyBanner}>
                  <Text style={styles.replyBannerText} numberOfLines={1}>
                    {t('feed.replyingTo').replace('{nick}', replyingTo.nick)}
                  </Text>
                  <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                    <Text style={styles.replyBannerCancel}>✕</Text>
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                ref={inputRef}
                style={styles.composerInput}
                placeholder={t('feed.commentPlaceholder')}
                placeholderTextColor={Brand.textMuted}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={MAX_COMMENT_LENGTH}
                editable={!posting}
              />
              <View style={styles.composerFooter}>
                <Text style={styles.charCount}>
                  {draft.length}/{MAX_COMMENT_LENGTH}
                </Text>
                <Pressable
                  onPress={() => void handleComment()}
                  disabled={!canComment}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    !canComment && styles.sendBtnDisabled,
                    pressed && canComment && styles.pressed,
                  ]}>
                  <Text style={styles.sendBtnText}>
                    {posting ? '…' : t('feed.commentSend')}
                  </Text>
                </Pressable>
              </View>
              {postError ? (
                <Text style={styles.postError}>{t('feed.commentError')}</Text>
              ) : null}
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function CommentRow({
  comment,
  isReply,
  onAuthorPress,
  onReply,
  onDelete,
}: {
  comment: PostComment;
  isReply: boolean;
  onAuthorPress: (userId: string) => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const displayName = comment.author_nick?.trim() || t('common.nick');

  return (
    <View style={[styles.commentRow, isReply && styles.commentReply]}>
      <Pressable onPress={() => onAuthorPress(comment.author_id)}>
        <UserAvatar
          nick={comment.author_nick}
          avatarUrl={comment.author_avatar_url}
          size={isReply ? 30 : 36}
        />
      </Pressable>
      <View style={styles.commentMain}>
        <View style={styles.commentHeader}>
          <Pressable onPress={() => onAuthorPress(comment.author_id)}>
            <Text style={styles.commentName}>{displayName}</Text>
          </Pressable>
          <Text style={styles.commentTime}>
            {formatRelativeShortTime(comment.created_at)}
          </Text>
        </View>
        <Text style={styles.commentBody}>{comment.body}</Text>
        <View style={styles.commentActions}>
          <Pressable onPress={onReply} hitSlop={8}>
            <Text style={styles.replyComment}>{t('feed.reply')}</Text>
          </Pressable>
          {comment.is_mine ? (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Text style={styles.deleteComment}>{t('feed.deleteComment')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  container: {
    flex: 1,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: Brand.textSecondary,
  },
  loader: {
    marginTop: 32,
  },
  error: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  emptyComments: {
    color: Brand.textMuted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.border,
  },
  commentReply: {
    paddingLeft: 44,
    backgroundColor: Brand.surfaceMuted,
  },
  commentMain: {
    flex: 1,
    gap: 4,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  commentName: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.textPrimary,
  },
  commentTime: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  commentBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Brand.textPrimary,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  replyComment: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.primary,
  },
  deleteComment: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.danger,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: Brand.primaryLight,
  },
  replyBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Brand.primaryDark,
  },
  replyBannerCancel: {
    fontSize: 14,
    fontWeight: '700',
    color: Brand.primaryDark,
    paddingHorizontal: 4,
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.border,
    backgroundColor: Brand.surface,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  composerInput: {
    minHeight: 44,
    maxHeight: 100,
    fontSize: 15,
    lineHeight: 20,
    color: Brand.textPrimary,
    textAlignVertical: 'top',
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  charCount: {
    fontSize: 12,
    color: Brand.textMuted,
  },
  sendBtn: {
    backgroundColor: Brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    color: Brand.primaryText,
    fontSize: 14,
    fontWeight: '700',
  },
  postError: {
    color: Brand.danger,
    fontSize: 13,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.85,
  },
});
