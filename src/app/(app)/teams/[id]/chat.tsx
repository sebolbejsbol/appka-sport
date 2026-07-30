import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

import { TeamAvatar } from '@/components/team-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { formatEventDateTime } from '@/lib/datetime';
import { goBack } from '@/lib/navigation';
import {
  listMessages,
  markConversationRead,
  sendMessage,
  subscribeToConversationMessages,
  type ChatMessage,
} from '@/lib/messages';
import { ensureTeamConversation, getTeamChatHeader } from '@/lib/teams';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
}

export default function TeamChatScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const teamId = params.id;

  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [teamName, setTeamName] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!teamId) return;
    const [headerRes, convRes] = await Promise.all([
      getTeamChatHeader(teamId),
      ensureTeamConversation(teamId),
    ]);

    const convId = convRes.conversationId ?? headerRes.data?.conversation_id ?? null;
    setTeamName(headerRes.data?.team_name ?? t('teams.detailTitle'));
    setLogoUrl(headerRes.data?.team_logo_url ?? null);
    setConversationId(convId);

    if (!convId) {
      setError(true);
      setLoading(false);
      return;
    }

    const msgRes = await listMessages(convId);
    setMessages(msgRes.data);
    setError(Boolean(headerRes.error || msgRes.error));
    setLoading(false);
    await markConversationRead(convId);
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    return subscribeToConversationMessages(conversationId, () => {
      void load();
    });
  }, [conversationId, load]);

  async function handleSend() {
    if (!conversationId || !draft.trim() || sending) return;
    setSending(true);
    const text = draft.trim();
    setDraft('');
    const { error: sendErr } = await sendMessage(conversationId, text);
    if (sendErr) setDraft(text);
    else await load();
    setSending(false);
  }

  if (!teamId) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('messages.loadError')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => goBack(`/teams/${teamId}` as Href)} hitSlop={12}>
          <Text style={styles.backText}>{t('common.back')}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/teams/${teamId}` as Href)}
          style={styles.headerMain}>
          <TeamAvatar name={teamName} logoUrl={logoUrl} size={40} />
          <Text style={styles.headerName} numberOfLines={1}>
            {teamName}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/teams/${teamId}` as Href)}
          hitSlop={10}
          accessibilityLabel={t('teams.settings')}
          style={styles.gearBtn}>
          <Text style={styles.gearIcon}>⚙</Text>
        </Pressable>
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubbleWrap,
                item.is_mine ? styles.bubbleWrapMine : styles.bubbleWrapTheirs,
              ]}>
              {!item.is_mine ? (
                <Text style={styles.senderNick}>
                  {item.sender_nick?.trim() || t('common.nick')}
                </Text>
              ) : null}
              {item.event_id ? (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/event/[id]', params: { id: item.event_id! } })
                  }
                  style={[styles.eventCard, item.is_mine && styles.eventCardMine]}>
                  <Text style={[styles.eventTitle, item.is_mine && styles.eventTitleMine]}>
                    {item.event_title?.trim() || t('eventsList.title')}
                  </Text>
                  {item.event_starts_at ? (
                    <Text style={[styles.eventTime, item.is_mine && styles.eventTimeMine]}>
                      {formatEventDateTime(item.event_starts_at)}
                    </Text>
                  ) : null}
                </Pressable>
              ) : (
                <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, item.is_mine && styles.bubbleTextMine]}>
                    {item.body}
                  </Text>
                </View>
              )}
              <Text style={styles.bubbleTime}>{formatTime(item.created_at)}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyChat}>{t('messages.emptyChat')}</Text>}
        />
      )}

      <View style={[styles.composer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={t('messages.inputPlaceholder')}
          placeholderTextColor={Brand.textMuted}
          style={styles.input}
          multiline
          maxLength={2000}
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
  headerName: { flex: 1, fontSize: 16, fontWeight: '700', color: Brand.textPrimary },
  gearBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryLight,
  },
  gearIcon: { fontSize: 18, color: Brand.primary },
  loader: { marginTop: 40 },
  error: { color: Brand.danger, textAlign: 'center', marginTop: 24 },
  listContent: { padding: 16, flexGrow: 1 },
  emptyChat: { textAlign: 'center', color: Brand.textMuted, marginTop: 40 },
  bubbleWrap: { marginBottom: 10, maxWidth: '86%' },
  bubbleWrapMine: { alignSelf: 'flex-end' },
  bubbleWrapTheirs: { alignSelf: 'flex-start' },
  senderNick: { fontSize: 12, color: Brand.textMuted, marginBottom: 4, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: Brand.primary, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 16, color: Brand.textPrimary, lineHeight: 22 },
  bubbleTextMine: { color: Brand.primaryText },
  bubbleTime: { fontSize: 11, color: Brand.textMuted, marginTop: 4, alignSelf: 'flex-end' },
  eventCard: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  eventCardMine: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  eventTitle: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  eventTitleMine: { color: Brand.primaryText },
  eventTime: { fontSize: 13, color: Brand.textMuted, marginTop: 4 },
  eventTimeMine: { color: 'rgba(255,255,255,0.8)' },
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
  pressed: { opacity: 0.85 },
  muted: { color: Brand.textMuted },
});
