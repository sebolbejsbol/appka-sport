import { t } from '@/i18n';
import type { ConversationListV2, ConversationRow, MessageKind } from '@/lib/messages';

export function formatConversationPreview(
  row: ConversationRow,
  myUserId: string | undefined,
): string {
  if (!row.last_message_body?.trim()) return t('messages.emptyPreview');
  const body = row.last_message_body.trim();
  if (row.last_message_sender_id && myUserId && row.last_message_sender_id === myUserId) {
    return `${t('messages.youPrefix')}${body}`;
  }
  return body;
}

function mediaPreviewLabel(kind: MessageKind | null): string {
  switch (kind) {
    case 'image':
      return t('chat.attachmentPhoto');
    case 'video':
      return t('chat.attachmentVideo');
    case 'audio':
      return t('chat.attachmentAudio');
    case 'file':
      return t('chat.attachmentFile');
    default:
      return t('chat.emptyPreview');
  }
}

/** Podgląd ostatniej wiadomości dla listy rozmów v2 (tekst / media / usunięta). */
export function formatChatPreview(
  row: ConversationListV2,
  myUserId: string | undefined,
): string {
  const last = row.last_message;
  if (!last || (!last.body && last.kind === 'text')) return t('chat.emptyPreview');
  if (last.is_deleted) return t('chat.deletedMessage');

  const mine = Boolean(last.sender_id && myUserId && last.sender_id === myUserId);
  const prefix = mine ? t('chat.you') : '';

  if (last.kind && last.kind !== 'text' && last.kind !== 'system') {
    return `${prefix}${mediaPreviewLabel(last.kind)}`;
  }
  const body = last.body?.trim();
  if (!body) return t('chat.emptyPreview');
  return `${prefix}${body}`;
}
