import { t } from '@/i18n';
import type { ChatMessageV2 } from '@/lib/messages';

type NickResolver = (userId: string | null | undefined) => string;

/** Renderuje wiadomość systemową (np. „Jan dodał Annę") z metadanych. */
export function formatSystemMessage(
  message: ChatMessageV2,
  resolveNick: NickResolver,
): string {
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const action = typeof meta.action === 'string' ? meta.action : '';
  const actor = message.sender_nick?.trim() || resolveNick(message.sender_id);
  const target = resolveNick(typeof meta.target_id === 'string' ? meta.target_id : null);
  const title = typeof meta.title === 'string' ? meta.title : '';

  switch (action) {
    case 'group_created':
      return t('chat.sysGroupCreated').replace('{actor}', actor);
    case 'group_renamed':
      return t('chat.sysGroupRenamed').replace('{actor}', actor).replace('{title}', title);
    case 'group_photo_changed':
      return t('chat.sysGroupPhoto').replace('{actor}', actor);
    case 'member_added':
      return t('chat.sysMemberAdded').replace('{actor}', actor).replace('{target}', target);
    case 'member_removed':
      return t('chat.sysMemberRemoved').replace('{actor}', actor).replace('{target}', target);
    case 'member_left':
      return t('chat.sysMemberLeft').replace('{actor}', actor);
    case 'role_changed':
      return t('chat.sysRoleChanged').replace('{actor}', actor).replace('{target}', target);
    default:
      return '';
  }
}
