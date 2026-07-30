import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { chatMediaUrl } from '@/lib/chat-media-storage';
import { formatTime } from '@/lib/datetime';
import type { ChatAttachment, ChatMessageV2 } from '@/lib/messages';
import { formatSystemMessage } from '@/lib/system-message';

type Props = {
  message: ChatMessageV2;
  isGroup: boolean;
  resolveNick: (userId: string | null | undefined) => string;
  onLongPress: (message: ChatMessageV2) => void;
  onReactPress: (message: ChatMessageV2, emoji: string) => void;
  onImagePress: (url: string) => void;
  onFilePress: (attachment: ChatAttachment) => void;
};

function StatusTicks({ status }: { status: 'sent' | 'delivered' | 'read' }) {
  if (status === 'sent') return <Text style={styles.tick}>✓</Text>;
  return (
    <Text style={[styles.tick, status === 'read' && styles.tickRead]}>✓✓</Text>
  );
}

function AttachmentView({
  attachment,
  isMine,
  onImagePress,
  onFilePress,
}: {
  attachment: ChatAttachment;
  isMine: boolean;
  onImagePress: (url: string) => void;
  onFilePress: (a: ChatAttachment) => void;
}) {
  const url = chatMediaUrl(attachment.storage_path);

  if (attachment.media_type === 'image') {
    return (
      <Pressable onPress={() => onImagePress(url)}>
        <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
      </Pressable>
    );
  }

  if (attachment.media_type === 'video') {
    const thumb = attachment.thumbnail_path ? chatMediaUrl(attachment.thumbnail_path) : null;
    return (
      <Pressable onPress={() => onFilePress(attachment)} style={styles.videoWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.videoPlaceholder]} />
        )}
        <View style={styles.playOverlay}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </Pressable>
    );
  }

  const icon = attachment.media_type === 'audio' ? '🎤' : '📎';
  return (
    <Pressable
      onPress={() => onFilePress(attachment)}
      style={[styles.fileCard, isMine ? styles.fileCardMine : styles.fileCardTheirs]}>
      <Text style={styles.fileIcon}>{icon}</Text>
      <Text
        style={[styles.fileName, isMine && styles.fileNameMine]}
        numberOfLines={1}>
        {attachment.file_name?.trim() ||
          (attachment.media_type === 'audio'
            ? t('chat.attachmentAudio')
            : t('chat.attachmentFile'))}
      </Text>
    </Pressable>
  );
}

export function ChatMessageItem({
  message,
  isGroup,
  resolveNick,
  onLongPress,
  onReactPress,
  onImagePress,
  onFilePress,
}: Props) {
  if (message.kind === 'system') {
    const text = formatSystemMessage(message, resolveNick);
    if (!text) return null;
    return (
      <View style={styles.systemWrap}>
        <Text style={styles.systemText}>{text}</Text>
      </View>
    );
  }

  const mine = message.is_mine;
  const showSender = isGroup && !mine;

  return (
    <Pressable
      onLongPress={() => onLongPress(message)}
      delayLongPress={250}
      style={[styles.wrap, mine ? styles.wrapMine : styles.wrapTheirs]}>
      {showSender ? (
        <Text style={styles.sender}>{message.sender_nick?.trim() || t('common.nick')}</Text>
      ) : null}

      {message.reply_to ? (
        <View style={[styles.reply, mine ? styles.replyMine : styles.replyTheirs]}>
          <Text style={styles.replyName} numberOfLines={1}>
            {message.reply_to.sender_nick?.trim() || t('common.nick')}
          </Text>
          <Text style={styles.replyBody} numberOfLines={1}>
            {message.reply_to.is_deleted
              ? t('chat.deletedMessage')
              : message.reply_to.body?.trim() || t('chat.attachmentPhoto')}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : styles.bubbleTheirs,
          message.attachments.length > 0 && styles.bubbleMedia,
        ]}>
        {message.is_deleted ? (
          <Text style={[styles.deleted, mine && styles.deletedMine]}>
            {t('chat.deletedMessage')}
          </Text>
        ) : (
          <>
            {message.attachments.map((a) => (
              <AttachmentView
                key={a.id}
                attachment={a}
                isMine={mine}
                onImagePress={onImagePress}
                onFilePress={onFilePress}
              />
            ))}
            {message.body?.trim() ? (
              <Text style={[styles.body, mine && styles.bodyMine, message.attachments.length > 0 && styles.bodyWithMedia]}>
                {message.body}
              </Text>
            ) : null}
          </>
        )}

        <View style={styles.metaRow}>
          {message.edited_at && !message.is_deleted ? (
            <Text style={[styles.metaText, mine && styles.metaTextMine]}>
              {t('chat.edited')}
            </Text>
          ) : null}
          <Text style={[styles.metaText, mine && styles.metaTextMine]}>
            {formatTime(message.created_at)}
          </Text>
          {mine && message.status ? <StatusTicks status={message.status} /> : null}
        </View>
      </View>

      {message.reactions.length > 0 ? (
        <View style={[styles.reactions, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
          {message.reactions.map((r) => (
            <Pressable
              key={r.emoji}
              onPress={() => onReactPress(message, r.emoji)}
              style={[styles.reactionChip, r.mine && styles.reactionChipMine]}>
              <Text style={styles.reactionEmoji}>{r.emoji}</Text>
              {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    maxWidth: '82%',
  },
  wrapMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  wrapTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  sender: {
    fontSize: 12,
    color: Brand.textMuted,
    marginBottom: 3,
    marginLeft: 6,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMedia: {
    padding: 4,
    overflow: 'hidden',
  },
  bubbleMine: {
    backgroundColor: Brand.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderBottomLeftRadius: 4,
  },
  body: {
    fontSize: 16,
    color: Brand.textPrimary,
    lineHeight: 22,
  },
  bodyMine: {
    color: Brand.primaryText,
  },
  bodyWithMedia: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 2,
  },
  deleted: {
    fontSize: 15,
    fontStyle: 'italic',
    color: Brand.textMuted,
  },
  deletedMine: {
    color: 'rgba(255,255,255,0.8)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  metaText: {
    fontSize: 11,
    color: Brand.textMuted,
  },
  metaTextMine: {
    color: 'rgba(255,255,255,0.75)',
  },
  tick: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  tickRead: {
    color: '#7dd3fc',
  },
  image: {
    width: 220,
    height: 220,
    borderRadius: 14,
    backgroundColor: Brand.border,
  },
  videoWrap: {
    position: 'relative',
  },
  videoPlaceholder: {
    backgroundColor: '#0f172a',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 30,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: 'center',
    lineHeight: 56,
    overflow: 'hidden',
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    minWidth: 160,
  },
  fileCardMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fileCardTheirs: {
    backgroundColor: Brand.surfaceMuted,
  },
  fileIcon: {
    fontSize: 22,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    color: Brand.textPrimary,
    fontWeight: '600',
  },
  fileNameMine: {
    color: Brand.primaryText,
  },
  reply: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 3,
    marginBottom: 4,
    maxWidth: '100%',
  },
  replyMine: {
    borderLeftColor: Brand.primary,
  },
  replyTheirs: {
    borderLeftColor: Brand.textMuted,
  },
  replyName: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  replyBody: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: -6,
  },
  reactionsMine: {
    justifyContent: 'flex-end',
  },
  reactionsTheirs: {
    justifyContent: 'flex-start',
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  reactionChipMine: {
    borderColor: Brand.primary,
    backgroundColor: Brand.primaryLight,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 12,
    color: Brand.textSecondary,
    fontWeight: '600',
  },
  systemWrap: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 24,
  },
  systemText: {
    fontSize: 12.5,
    color: Brand.textMuted,
    textAlign: 'center',
    backgroundColor: Brand.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
