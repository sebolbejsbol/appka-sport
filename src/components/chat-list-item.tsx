import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConversationAvatar } from '@/components/conversation-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatChatPreview } from '@/lib/conversation-preview';
import { formatRelativeShortTime } from '@/lib/datetime';
import type { ConversationListV2 } from '@/lib/messages';

const UNREAD_DOT = '#0095f6';

type Props = {
  row: ConversationListV2;
  myUserId?: string;
  onPress: () => void;
  onLongPress?: () => void;
};

export function ChatListItem({ row, myUserId, onPress, onLongPress }: Props) {
  const unread = row.unread_count > 0;
  const displayName = row.title?.trim() || t('common.nick');
  const preview = formatChatPreview(row, myUserId);
  const timeLabel = row.last_at ? formatRelativeShortTime(row.last_at) : '';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ConversationAvatar
        kind={row.kind}
        title={row.title}
        photoUrl={row.photo_url}
        isOnline={row.other_is_online}
        size={56}
      />

      <View style={styles.main}>
        <View style={styles.titleRow}>
          {row.pinned ? <Text style={styles.pin}>📌</Text> : null}
          <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        <Text style={styles.previewLine} numberOfLines={1}>
          <Text style={[styles.preview, unread && styles.previewUnread]}>{preview}</Text>
          {timeLabel ? <Text style={styles.time}>{` · ${timeLabel}`}</Text> : null}
        </Text>
      </View>

      {row.muted ? <Text style={styles.muted}>🔕</Text> : null}
      {unread ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{row.unread_count > 99 ? '99+' : row.unread_count}</Text>
        </View>
      ) : (
        <View style={styles.dotSpacer} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Brand.surface,
  },
  pressed: {
    backgroundColor: Brand.surfaceMuted,
  },
  main: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pin: {
    fontSize: 12,
  },
  name: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  nameUnread: {
    fontWeight: '700',
  },
  previewLine: {
    fontSize: 14,
    lineHeight: 18,
  },
  preview: {
    color: Brand.textMuted,
  },
  previewUnread: {
    color: Brand.textSecondary,
    fontWeight: '500',
  },
  time: {
    color: Brand.textMuted,
  },
  muted: {
    fontSize: 14,
    marginRight: 2,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: UNREAD_DOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dotSpacer: {
    width: 10,
  },
});
