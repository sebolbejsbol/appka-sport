import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { formatConversationPreview } from '@/lib/conversation-preview';
import { formatRelativeShortTime } from '@/lib/datetime';
import type { ConversationRow } from '@/lib/messages';

const IG_UNREAD_DOT = '#0095f6';

type Props = {
  row: ConversationRow;
  myUserId?: string;
  onPress: () => void;
};

export function ConversationListItem({ row, myUserId, onPress }: Props) {
  const unread = row.unread_count > 0;
  const displayName = row.other_nick?.trim() || t('common.nick');
  const preview = formatConversationPreview(row, myUserId);
  const timeLabel = row.last_message_at ? formatRelativeShortTime(row.last_message_at) : '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <UserAvatar nick={row.other_nick} avatarUrl={row.other_avatar_url} size={56} />

      <View style={styles.main}>
        <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
          {displayName}
        </Text>

        <Text style={styles.previewLine} numberOfLines={1}>
          <Text style={[styles.preview, unread && styles.previewUnread]}>{preview}</Text>
          {timeLabel ? (
            <Text style={styles.time}>
              {' · '}
              {timeLabel}
            </Text>
          ) : null}
        </Text>
      </View>

      {unread ? <View style={styles.unreadDot} /> : <View style={styles.dotSpacer} />}
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
  name: {
    fontFamily: BrandFonts.bodySemibold,
    fontSize: 16,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  nameUnread: {
    fontFamily: BrandFonts.bodyBold,
    fontWeight: '700',
  },
  previewLine: {
    fontFamily: BrandFonts.body,
    fontSize: 14,
    lineHeight: 18,
  },
  preview: {
    color: Brand.textMuted,
  },
  previewUnread: {
    fontFamily: BrandFonts.bodyMedium,
    color: Brand.textSecondary,
    fontWeight: '500',
  },
  time: {
    color: Brand.textMuted,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: IG_UNREAD_DOT,
    marginLeft: 4,
  },
  dotSpacer: {
    width: 10,
    marginLeft: 4,
  },
});
