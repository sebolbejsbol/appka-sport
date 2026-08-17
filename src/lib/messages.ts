import { supabase } from '@/lib/supabase';

export type ConversationRow = {
  conversation_id: string;
  other_user_id: string;
  other_nick: string | null;
  other_avatar_url: string | null;
  other_is_online: boolean;
  last_message_body: string | null;
  last_message_at: string;
  last_message_sender_id: string | null;
  unread_count: number;
};

export type ChatMessage = {
  id: string;
  sender_id: string;
  sender_nick?: string | null;
  body: string;
  created_at: string;
  is_mine: boolean;
  event_id?: string | null;
  event_title?: string | null;
  event_starts_at?: string | null;
};

export type ConversationHeader = {
  conversation_id: string;
  other_user_id: string;
  other_nick: string | null;
  other_avatar_url: string | null;
  other_is_online: boolean;
  other_last_read_at: string | null;
};

export async function openDmConversation(
  otherUserId: string,
): Promise<{ data: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('open_dm_conversation', {
    p_other_user_id: otherUserId,
  });
  if (error) return { data: null, error };
  return { data: typeof data === 'string' ? data : null, error: null };
}

export async function listConversations(): Promise<{
  data: ConversationRow[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_conversations');
  if (error) return { data: [], error };
  return { data: (data as ConversationRow[] | null) ?? [], error: null };
}

export async function listMessages(
  conversationId: string,
): Promise<{ data: ChatMessage[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_messages', {
    p_conversation_id: conversationId,
  });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((raw) => ({
      id: String(raw.id ?? ''),
      sender_id: String(raw.sender_id ?? ''),
      sender_nick: typeof raw.sender_nick === 'string' ? raw.sender_nick : null,
      body: String(raw.body ?? ''),
      created_at: String(raw.created_at ?? ''),
      is_mine: Boolean(raw.is_mine),
      event_id: typeof raw.event_id === 'string' ? raw.event_id : null,
      event_title: typeof raw.event_title === 'string' ? raw.event_title : null,
      event_starts_at:
        typeof raw.event_starts_at === 'string' ? raw.event_starts_at : null,
    })),
    error: null,
  };
}

export async function getConversationHeader(
  conversationId: string,
): Promise<{ data: ConversationHeader | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_conversation_header', {
    p_conversation_id: conversationId,
  });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  const raw = data as Record<string, unknown>;
  if (raw.error) return { data: null, error: null };
  return {
    data: {
      conversation_id: String(raw.conversation_id ?? ''),
      other_user_id: String(raw.other_user_id ?? ''),
      other_nick: typeof raw.other_nick === 'string' ? raw.other_nick : null,
      other_avatar_url:
        typeof raw.other_avatar_url === 'string' ? raw.other_avatar_url : null,
      other_is_online: Boolean(raw.other_is_online),
      other_last_read_at:
        typeof raw.other_last_read_at === 'string' ? raw.other_last_read_at : null,
    },
    error: null,
  };
}

export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<{ data: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) return { data: null, error };
  return { data: typeof data === 'string' ? data : null, error: null };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

// realtime-js zwraca istniejący kanał, jeśli temat się powtarza. Ponieważ
// removeChannel jest asynchroniczne, przy ponownym montowaniu ekranu mógł zostać
// reużyty już zasubskrybowany kanał — a dodanie do niego callbacku postgres_changes
// rzuca "cannot add postgres_changes callbacks ... after subscribe()". Unikalny temat
// na każdą subskrypcję eliminuje kolizję (kanał postgres_changes nie wymaga
// współdzielonego tematu).
let realtimeChannelSeq = 0;

export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: () => void,
): () => void {
  const channel = supabase
    .channel(`dm:${conversationId}:${++realtimeChannelSeq}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      () => onInsert(),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Messenger v2 — typy
// ════════════════════════════════════════════════════════════════════════════

export type ConversationKind = 'dm' | 'group' | 'team';
export type MessageKind = 'text' | 'image' | 'video' | 'file' | 'audio' | 'system';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type ChatMediaType = 'image' | 'video' | 'file' | 'audio';

export type ChatAttachment = {
  id: string;
  media_type: ChatMediaType;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  file_name: string | null;
  thumbnail_path: string | null;
};

export type ChatReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type ChatReplyPreview = {
  id: string;
  sender_nick: string | null;
  kind: MessageKind;
  body: string | null;
  is_deleted: boolean;
};

export type ChatMessageV2 = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_nick: string | null;
  sender_avatar_url: string | null;
  is_mine: boolean;
  kind: MessageKind;
  body: string | null;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  metadata: Record<string, unknown> | null;
  event_id: string | null;
  event_title: string | null;
  event_starts_at: string | null;
  reply_to: ChatReplyPreview | null;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
  status: MessageStatus | null;
  read_by_count: number | null;
};

export type ConversationListV2 = {
  conversation_id: string;
  kind: ConversationKind;
  pinned: boolean;
  muted: boolean;
  last_at: string;
  last_message: {
    body: string | null;
    kind: MessageKind | null;
    created_at: string | null;
    sender_id: string | null;
    is_deleted: boolean;
  } | null;
  unread_count: number;
  title: string | null;
  photo_url: string | null;
  other_user_id: string | null;
  other_is_online: boolean;
  member_count: number;
};

export type ConversationSearchResult = {
  conversation_id: string;
  kind: ConversationKind;
  title: string | null;
  photo_url: string | null;
  other_user_id: string | null;
};

export type ConversationMeta = {
  conversation_id: string;
  kind: ConversationKind;
  title: string | null;
  photo_url: string | null;
  other_user_id: string | null;
  other_is_online: boolean;
  my_role: 'owner' | 'admin' | 'member' | null;
  member_count: number;
};

export type OutgoingAttachment = {
  media_type: ChatMediaType;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  file_name?: string | null;
  thumbnail_path?: string | null;
};

// ════════════════════════════════════════════════════════════════════════════
// Messenger v2 — lista rozmów / wyszukiwanie
// ════════════════════════════════════════════════════════════════════════════

export async function listConversationsV2(): Promise<{
  data: ConversationListV2[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_conversations_v2');
  if (error) return { data: [], error };
  return { data: (data as ConversationListV2[] | null) ?? [], error: null };
}

/**
 * Suma nieprzeczytanych wiadomości ze wszystkich rozmów — do odznaczki przy
 * "Wiadomości" w nawigacji, ODDZIELNIE od ogólnego dzwonka powiadomień (ten
 * ostatni ma pokazywać resztę: zaproszenia, dołączenia do eventu itd., patrz
 * app-side-menu.tsx). Reużywa już istniejącego list_conversations_v2 zamiast
 * osobnego zapytania — unread_count per rozmowa jest już liczony po stronie bazy.
 */
export async function getUnreadMessageCount(): Promise<number> {
  const { data } = await listConversationsV2();
  return data.reduce((sum, row) => sum + (row.unread_count || 0), 0);
}

export async function getConversationMeta(conversationId: string): Promise<{
  data: ConversationMeta | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('get_conversation_meta', {
    p_conversation_id: conversationId,
  });
  if (error) return { data: null, error };
  const raw = data as Record<string, unknown> | null;
  if (!raw || raw.error) return { data: null, error: null };
  return {
    data: {
      conversation_id: String(raw.conversation_id ?? ''),
      kind: (raw.kind === 'group' || raw.kind === 'team' ? raw.kind : 'dm') as ConversationKind,
      title: typeof raw.title === 'string' ? raw.title : null,
      photo_url: typeof raw.photo_url === 'string' ? raw.photo_url : null,
      other_user_id: typeof raw.other_user_id === 'string' ? raw.other_user_id : null,
      other_is_online: Boolean(raw.other_is_online),
      my_role:
        raw.my_role === 'owner' || raw.my_role === 'admin' || raw.my_role === 'member'
          ? raw.my_role
          : null,
      member_count: Number(raw.member_count) || 0,
    },
    error: null,
  };
}

export async function searchConversations(query: string): Promise<{
  data: ConversationSearchResult[];
  error: { message: string } | null;
}> {
  const term = query.trim();
  if (!term) return { data: [], error: null };
  const { data, error } = await supabase.rpc('search_conversations', { p_query: term });
  if (error) return { data: [], error };
  return { data: (data as ConversationSearchResult[] | null) ?? [], error: null };
}

// ════════════════════════════════════════════════════════════════════════════
// Messenger v2 — wiadomości (paginacja, wysyłka, edycja, reakcje)
// ════════════════════════════════════════════════════════════════════════════

const MESSAGE_PAGE_SIZE = 30;

/** Strona wiadomości. `before` = created_at najstarszej znanej wiadomości (infinite scroll w górę). */
export async function listMessagesV2(
  conversationId: string,
  before?: string | null,
  limit = MESSAGE_PAGE_SIZE,
): Promise<{ data: ChatMessageV2[]; hasMore: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_messages_v2', {
    p_conversation_id: conversationId,
    p_before: before ?? null,
    p_limit: limit,
  });
  if (error) return { data: [], hasMore: false, error };
  const rows = (data as ChatMessageV2[] | null) ?? [];
  return { data: rows, hasMore: rows.length >= limit, error: null };
}

export async function sendMessageV2(
  conversationId: string,
  opts: {
    body?: string | null;
    kind?: MessageKind;
    replyToId?: string | null;
    attachments?: OutgoingAttachment[];
  },
): Promise<{ data: { id: string; created_at: string } | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('send_message_v2', {
    p_conversation_id: conversationId,
    p_body: opts.body ?? null,
    p_kind: opts.kind ?? 'text',
    p_reply_to_id: opts.replyToId ?? null,
    p_attachments: opts.attachments ?? [],
  });
  if (error) return { data: null, error };
  const raw = data as Record<string, unknown> | null;
  if (!raw) return { data: null, error: null };
  return {
    data: { id: String(raw.id ?? ''), created_at: String(raw.created_at ?? '') },
    error: null,
  };
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('edit_message', { p_message_id: messageId, p_body: body });
  return { error };
}

export async function deleteMessage(
  messageId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('delete_message', { p_message_id: messageId });
  return { error };
}

/** Przełącza reakcję; zwraca true gdy reakcja została dodana, false gdy usunięta. */
export async function toggleReaction(
  messageId: string,
  emoji: string,
): Promise<{ reacted: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('toggle_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  return { reacted: Boolean(data), error };
}

export async function markConversationDelivered(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_delivered', { p_conversation_id: conversationId });
}

export async function setConversationPinned(
  conversationId: string,
  pinned: boolean,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_conversation_pinned', {
    p_conversation_id: conversationId,
    p_pinned: pinned,
  });
  return { error };
}

export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_conversation_muted', {
    p_conversation_id: conversationId,
    p_muted: muted,
  });
  return { error };
}

// ════════════════════════════════════════════════════════════════════════════
// Messenger v2 — realtime (wiadomości, reakcje, „pisze...")
// ════════════════════════════════════════════════════════════════════════════

export type ConversationRealtimeHandlers = {
  /** Zmiana w wiadomościach (insert/update/delete) lub reakcjach. */
  onChange?: () => void;
  /** Ktoś pisze. `typing=false` gdy przestał. */
  onTyping?: (payload: { userId: string; nick: string | null; typing: boolean }) => void;
};

export type ConversationChannel = {
  /** Rozgłasza, że bieżący użytkownik pisze / przestał pisać. */
  sendTyping: (typing: boolean, me: { userId: string; nick: string | null }) => void;
  unsubscribe: () => void;
};

/**
 * Subskrypcja rozmowy: zmiany wiadomości + reakcji (postgres_changes) oraz
 * wskaźnik „pisze..." (broadcast — bez zapisu do bazy, skalowalne).
 */
export function subscribeToConversation(
  conversationId: string,
  handlers: ConversationRealtimeHandlers,
): ConversationChannel {
  // Czat używa broadcastu „pisze…", więc temat musi być współdzielony między
  // urządzeniami (stały `chat:<id>`). Aby uniknąć reużycia nieposprzątanego kanału
  // po szybkim remontcie ekranu, najpierw usuwamy ewentualny stary kanał o tym temacie.
  const topic = `chat:${conversationId}`;
  const realtimeTopic = `realtime:${topic}`;
  for (const existing of supabase.getChannels()) {
    if (existing.topic === realtimeTopic) {
      void supabase.removeChannel(existing);
    }
  }

  const channel = supabase.channel(topic, {
    config: { broadcast: { self: false } },
  });

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      () => handlers.onChange?.(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'message_reactions' },
      () => handlers.onChange?.(),
    )
    .on('broadcast', { event: 'typing' }, (msg) => {
      const p = (msg.payload ?? {}) as { userId?: string; nick?: string | null; typing?: boolean };
      if (p.userId) {
        handlers.onTyping?.({ userId: p.userId, nick: p.nick ?? null, typing: Boolean(p.typing) });
      }
    })
    .subscribe();

  return {
    sendTyping: (typing, me) => {
      void channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: me.userId, nick: me.nick, typing },
      });
    },
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}
