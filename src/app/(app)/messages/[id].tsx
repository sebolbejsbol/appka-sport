import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { ChatMessageItem } from '@/components/chat-message-item';
import { ConversationAvatar } from '@/components/conversation-avatar';
import { Brand } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import { chatMediaUrl, uploadChatMedia } from '@/lib/chat-media-storage';
import { listGroupMembers, type GroupMember } from '@/lib/groups';
import { goBack } from '@/lib/navigation';
import { pickChatMedia } from '@/lib/pick-image';
import {
  deleteMessage,
  editMessage,
  getConversationMeta,
  listMessagesV2,
  markConversationDelivered,
  markConversationRead,
  sendMessageV2,
  subscribeToConversation,
  toggleReaction,
  type ChatAttachment,
  type ChatMessageV2,
  type ConversationMeta,
} from '@/lib/messages';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function mergeMessages(prev: ChatMessageV2[], incoming: ChatMessageV2[]): ChatMessageV2[] {
  const byId = new Map<string, ChatMessageV2>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myUserId = session?.user?.id;
  const myNick =
    (session?.user?.user_metadata?.nick as string | undefined)?.trim() || null;

  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = params.id;

  const listRef = useRef<FlatList<ChatMessageV2>>(null);
  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<ChatMessageV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessageV2 | null>(null);
  const [editing, setEditing] = useState<ChatMessageV2 | null>(null);
  const [typingName, setTypingName] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof subscribeToConversation> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isGroup = meta?.kind === 'group';

  const nickMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) if (m.nick) map.set(m.user_id, m.nick);
    return map;
  }, [members]);

  const resolveNick = useCallback(
    (userId: string | null | undefined): string => {
      if (!userId) return t('common.nick');
      if (userId === myUserId) return t('chat.you').replace(': ', '');
      return nickMap.get(userId) ?? t('common.nick');
    },
    [nickMap, myUserId],
  );

  const load = useCallback(async () => {
    if (!conversationId) return;
    const [metaRes, msgRes] = await Promise.all([
      getConversationMeta(conversationId),
      listMessagesV2(conversationId, null),
    ]);
    setMeta(metaRes.data);
    setMessages(msgRes.data);
    setHasMore(msgRes.hasMore);
    setError(Boolean(metaRes.error || msgRes.error) || !metaRes.data);
    setLoading(false);

    if (metaRes.data?.kind === 'group') {
      const { data } = await listGroupMembers(conversationId);
      setMembers(data);
    }
    await markConversationRead(conversationId);
    await markConversationDelivered(conversationId);
  }, [conversationId]);

  const reloadLatest = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await listMessagesV2(conversationId, null);
    setMessages((prev) => mergeMessages(prev, data));
    await markConversationRead(conversationId);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = subscribeToConversation(conversationId, {
      onChange: () => void reloadLatest(),
      onTyping: ({ userId, nick, typing }) => {
        if (userId === myUserId) return;
        if (typingClear.current) clearTimeout(typingClear.current);
        if (typing) {
          setTypingName(nick ?? resolveNick(userId));
          typingClear.current = setTimeout(() => setTypingName(null), 4000);
        } else {
          setTypingName(null);
        }
      },
    });
    channelRef.current = ch;
    return () => {
      ch.unsubscribe();
      channelRef.current = null;
    };
  }, [conversationId, myUserId, reloadLatest, resolveNick]);

  async function loadOlder() {
    if (!conversationId || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const { data, hasMore: more } = await listMessagesV2(conversationId, oldest);
    setMessages((prev) => mergeMessages(data, prev));
    setHasMore(more);
    setLoadingOlder(false);
  }

  function onDraftChange(text: string) {
    setDraft(text);
    if (!myUserId) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    channelRef.current?.sendTyping(true, { userId: myUserId, nick: myNick });
    typingTimer.current = setTimeout(() => {
      channelRef.current?.sendTyping(false, { userId: myUserId, nick: myNick });
    }, 2500);
  }

  async function handleSend() {
    if (!conversationId || !draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft('');
    channelRef.current?.sendTyping(false, { userId: myUserId ?? '', nick: myNick });

    if (editing) {
      const { error: editErr } = await editMessage(editing.id, text);
      setEditing(null);
      if (editErr) setDraft(text);
      else await reloadLatest();
      setSending(false);
      return;
    }

    const { error: sendErr } = await sendMessageV2(conversationId, {
      body: text,
      replyToId: replyTo?.id ?? null,
    });
    setReplyTo(null);
    if (sendErr) {
      setDraft(text);
      Alert.alert(t('messages.sendError'));
    } else {
      await reloadLatest();
    }
    setSending(false);
  }

  async function handleAttach() {
    if (!conversationId || sending) return;
    const picked = await pickChatMedia();
    if (picked.length === 0) return;
    setSending(true);
    const { attachments, error: upErr } = await uploadChatMedia(
      picked.map((p) => ({
        uri: p.uri,
        mediaType: p.mediaType,
        mimeType: p.mimeType,
        fileName: p.fileName,
        sizeBytes: p.sizeBytes,
        width: p.width,
        height: p.height,
        durationMs: p.durationMs,
      })),
    );
    if (upErr || attachments.length === 0) {
      setSending(false);
      Alert.alert(upErr === 'file_too_large' ? t('chat.actionFailed') : t('messages.sendError'));
      return;
    }
    const kind = attachments.some((a) => a.media_type === 'image') ? 'image' : attachments[0].media_type;
    const { error: sendErr } = await sendMessageV2(conversationId, {
      kind,
      attachments,
      replyToId: replyTo?.id ?? null,
    });
    setReplyTo(null);
    if (sendErr) Alert.alert(t('messages.sendError'));
    else await reloadLatest();
    setSending(false);
  }

  function openAttachment(a: ChatAttachment) {
    const url = chatMediaUrl(a.storage_path);
    if (!url) return;
    if (a.media_type === 'video') {
      router.push({ pathname: '/media-viewer', params: { url, type: 'video' } });
    } else {
      void WebBrowser.openBrowserAsync(url);
    }
  }

  function onMessageLongPress(message: ChatMessageV2) {
    if (message.is_deleted || message.kind === 'system') return;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: t('chat.reply'), onPress: () => setReplyTo(message) },
      { text: '👍', onPress: () => void reactAndReload(message.id, '👍') },
      { text: '❤️', onPress: () => void reactAndReload(message.id, '❤️') },
      { text: '😂', onPress: () => void reactAndReload(message.id, '😂') },
    ];
    if (message.is_mine && message.kind === 'text') {
      buttons.push({
        text: t('chat.edit'),
        onPress: () => {
          setEditing(message);
          setReplyTo(null);
          setDraft(message.body ?? '');
        },
      });
    }
    const canDelete =
      message.is_mine || meta?.my_role === 'owner' || meta?.my_role === 'admin';
    if (canDelete) {
      buttons.push({
        text: t('chat.delete'),
        style: 'destructive',
        onPress: () => void deleteAndReload(message.id),
      });
    }
    buttons.push({ text: t('chat.cancel'), style: 'cancel' });
    Alert.alert(t('chat.react'), undefined, buttons);
  }

  async function reactAndReload(messageId: string, emoji: string) {
    await toggleReaction(messageId, emoji);
    await reloadLatest();
  }

  async function deleteAndReload(messageId: string) {
    await deleteMessage(messageId);
    await reloadLatest();
  }

  function openHeaderTarget() {
    if (!meta) return;
    if (meta.kind === 'dm' && meta.other_user_id) {
      router.push({ pathname: '/user/[id]', params: { id: meta.other_user_id } });
    } else if (meta.kind === 'group' && conversationId) {
      router.push({ pathname: '/messages/group/[id]', params: { id: conversationId } });
    }
  }

  if (!conversationId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('messages.loadError')}</Text>
      </View>
    );
  }

  const subtitle = typingName
    ? isGroup
      ? t('chat.typingMany').replace('{name}', typingName)
      : t('chat.typing')
    : meta?.kind === 'group'
      ? t('chat.members').replace('{count}', String(meta.member_count))
      : meta?.other_is_online
        ? t('chat.online')
        : '';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack('/messages' as Href)} hitSlop={12}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
        {meta ? (
          <Pressable style={styles.headerMain} onPress={openHeaderTarget}>
            <ConversationAvatar
              kind={meta.kind}
              title={meta.title}
              photoUrl={meta.photo_url}
              isOnline={meta.other_is_online}
              size={40}
            />
            <View style={styles.headerText}>
              <Text style={styles.headerName} numberOfLines={1}>
                {meta.title?.trim() || t('common.nick')}
              </Text>
              {subtitle ? (
                <Text style={styles.headerStatus} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{t('messages.loadError')}</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => {
            if (!loadingOlder) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListHeaderComponent={
            hasMore ? (
              <Pressable
                onPress={() => void loadOlder()}
                style={styles.loadMore}
                disabled={loadingOlder}>
                {loadingOlder ? (
                  <ActivityIndicator color={Brand.primary} />
                ) : (
                  <Text style={styles.loadMoreText}>{t('chat.loadMore')}</Text>
                )}
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <ChatMessageItem
              message={item}
              isGroup={Boolean(isGroup)}
              resolveNick={resolveNick}
              onLongPress={onMessageLongPress}
              onReactPress={(m, emoji) => void reactAndReload(m.id, emoji)}
              onImagePress={(url) => router.push({ pathname: '/media-viewer', params: { url } })}
              onFilePress={openAttachment}
            />
          )}
          ListEmptyComponent={<Text style={styles.emptyChat}>{t('messages.emptyChat')}</Text>}
        />
      )}

      {replyTo ? (
        <View style={styles.replyBar}>
          <View style={styles.replyBarText}>
            <Text style={styles.replyBarName}>
              {t('chat.replyingTo').replace('{name}', resolveNick(replyTo.sender_id))}
            </Text>
            <Text style={styles.replyBarBody} numberOfLines={1}>
              {replyTo.body?.trim() || t('chat.attachmentPhoto')}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
            <Text style={styles.replyBarClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      {editing ? (
        <View style={styles.replyBar}>
          <Text style={styles.replyBarName}>{t('chat.edit')}</Text>
          <Pressable
            onPress={() => {
              setEditing(null);
              setDraft('');
            }}
            hitSlop={10}>
            <Text style={styles.replyBarClose}>✕</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable
          onPress={() => void handleAttach()}
          disabled={sending || Boolean(editing)}
          hitSlop={8}
          style={({ pressed }) => [styles.attachBtn, pressed && styles.pressed]}>
          <Text style={styles.attachIcon}>＋</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder={t('messages.inputPlaceholder')}
          placeholderTextColor={Brand.textMuted}
          style={styles.input}
          multiline
          maxLength={4000}
        />
        <Pressable
          onPress={() => void handleSend()}
          disabled={!draft.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            (!draft.trim() || sending) && styles.sendBtnDisabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.sendText}>{t('messages.send')}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  backText: { fontSize: 16, color: Brand.primary, fontWeight: '600' },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  headerName: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary },
  headerStatus: { fontSize: 12, color: Brand.textMuted },
  loader: { marginTop: 40 },
  error: { color: Brand.danger, textAlign: 'center', marginTop: 24 },
  listContent: { padding: 16, flexGrow: 1 },
  emptyChat: { textAlign: 'center', color: Brand.textMuted, marginTop: 40 },
  loadMore: { alignItems: 'center', paddingVertical: 10, marginBottom: 6 },
  loadMoreText: { color: Brand.primary, fontWeight: '600', fontSize: 14 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Brand.surfaceMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.border,
  },
  replyBarText: { flex: 1, minWidth: 0 },
  replyBarName: { fontSize: 13, fontWeight: '700', color: Brand.textSecondary },
  replyBarBody: { fontSize: 13, color: Brand.textMuted },
  replyBarClose: { fontSize: 16, color: Brand.textMuted, paddingHorizontal: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: Brand.textPrimary,
    backgroundColor: Brand.screenBackground,
  },
  sendBtn: {
    backgroundColor: Brand.primary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendText: { color: Brand.primaryText, fontWeight: '700', fontSize: 15 },
  attachBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.surfaceMuted,
  },
  attachIcon: { fontSize: 24, color: Brand.primary, fontWeight: '700', marginTop: -2 },
  pressed: { opacity: 0.85 },
  muted: { color: Brand.textMuted },
});
