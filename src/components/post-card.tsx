import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PostBodyText } from '@/components/post-body-text';
import { PostMedia } from '@/components/post-media';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { formatRelativeShortTime } from '@/lib/datetime';
import type { PostMediaItem, PostMention } from '@/lib/posts';

type Props = {
  postId: string;
  authorId: string;
  authorNick: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  isFriend?: boolean;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  likeBusy?: boolean;
  isMine?: boolean;
  mentions?: PostMention[];
  media?: PostMediaItem[];
  onAuthorPress: (userId: string) => void;
  onMentionPress?: (userId: string) => void;
  onLikePress?: () => void;
  onCommentPress?: () => void;
  onSharePress?: () => void;
  onBodyPress?: () => void;
  onDeletePress?: () => void;
};

export function PostCard({
  authorId,
  authorNick,
  authorAvatarUrl,
  body,
  createdAt,
  isFriend,
  likeCount,
  commentCount,
  isLiked,
  likeBusy = false,
  isMine = false,
  mentions = [],
  media = [],
  onAuthorPress,
  onMentionPress,
  onLikePress,
  onCommentPress,
  onSharePress,
  onBodyPress,
  onDeletePress,
}: Props) {
  const displayName = authorNick?.trim() || t('common.nick');
  const timeLabel = formatRelativeShortTime(createdAt);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onAuthorPress(authorId)}
          style={({ pressed }) => [styles.headerAuthor, pressed && styles.pressed]}>
          <UserAvatar nick={authorNick} avatarUrl={authorAvatarUrl} size={44} />
          <View style={styles.headerText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {displayName}
              </Text>
              {isFriend ? (
                <View style={styles.friendBadge}>
                  <Text style={styles.friendBadgeText}>{t('social.isFriend')}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.time}>{timeLabel}</Text>
          </View>
        </Pressable>
        {isMine && onDeletePress ? (
          <Pressable
            onPress={onDeletePress}
            hitSlop={10}
            accessibilityLabel={t('feed.deletePost')}
            style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
            <Text style={styles.menuIcon}>⋯</Text>
          </Pressable>
        ) : null}
      </View>

      {body.trim() ? (
        <Pressable
          onPress={onBodyPress}
          disabled={!onBodyPress}
          style={({ pressed }) => [onBodyPress && pressed && styles.pressed]}>
          <PostBodyText
            body={body}
            mentions={mentions}
            onMentionPress={onMentionPress ?? onAuthorPress}
          />
        </Pressable>
      ) : null}

      {media.length > 0 ? <PostMedia media={media} onPress={onBodyPress} /> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onLikePress}
          disabled={!onLikePress || likeBusy}
          style={({ pressed }) => [
            styles.actionBtn,
            isLiked && styles.actionBtnActive,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.actionIcon, isLiked && styles.actionIconActive]}>
            {isLiked ? '♥' : '♡'}
          </Text>
          <Text style={[styles.actionLabel, isLiked && styles.actionLabelActive]}>
            {likeCount > 0 ? String(likeCount) : t('feed.like')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onCommentPress}
          disabled={!onCommentPress}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionLabel}>
            {commentCount > 0 ? String(commentCount) : t('feed.comment')}
          </Text>
        </Pressable>

        <Pressable
          onPress={onSharePress}
          disabled={!onSharePress}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <Text style={styles.actionIcon}>↗</Text>
          <Text style={styles.actionLabel}>{t('feed.share')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
    ...shadow('sm'),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  headerAuthor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceMuted,
  },
  menuIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: Brand.textSecondary,
    marginTop: -4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.textPrimary,
    flexShrink: 1,
  },
  friendBadge: {
    backgroundColor: Brand.surfaceMuted,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  friendBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.textMuted,
  },
  time: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Brand.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Brand.surfaceMuted,
  },
  actionBtnActive: {
    backgroundColor: '#fee2e2',
  },
  actionIcon: {
    fontSize: 16,
    color: Brand.textSecondary,
  },
  actionIconActive: {
    color: '#ef4444',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  actionLabelActive: {
    color: '#ef4444',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
