import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/conversation-avatar';
import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { useSession } from '@/context/session';
import { t } from '@/i18n';
import {
  addGroupMembers,
  deleteGroup,
  leaveGroup,
  listGroupMembers,
  removeGroupMember,
  setGroupMemberRole,
  setGroupTitle,
  type GroupMember,
  type GroupRole,
} from '@/lib/groups';
import { getConversationMeta, type ConversationMeta } from '@/lib/messages';
import { goBack } from '@/lib/navigation';
import { listFriends, type SocialUserRow } from '@/lib/social';

function roleLabel(role: GroupRole): string {
  if (role === 'owner') return t('chat.roleOwner');
  if (role === 'admin') return t('chat.roleAdmin');
  return t('chat.roleMember');
}

export default function GroupInfoScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const myUserId = session?.user?.id;
  const params = useLocalSearchParams<{ id?: string }>();
  const conversationId = params.id;

  const [meta, setMeta] = useState<ConversationMeta | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<SocialUserRow[]>([]);

  const canManage = meta?.my_role === 'owner' || meta?.my_role === 'admin';
  const isOwner = meta?.my_role === 'owner';

  const load = useCallback(async () => {
    if (!conversationId) return;
    const [metaRes, memRes] = await Promise.all([
      getConversationMeta(conversationId),
      listGroupMembers(conversationId),
    ]);
    setMeta(metaRes.data);
    setMembers(memRes.data);
    setTitleDraft(metaRes.data?.title ?? '');
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  async function saveTitle() {
    if (!conversationId || !titleDraft.trim()) return;
    const { error } = await setGroupTitle(conversationId, titleDraft);
    setEditingTitle(false);
    if (error) Alert.alert(t('chat.actionFailed'));
    else await load();
  }

  async function openAddMembers() {
    setAdding(true);
    const { data } = await listFriends();
    setFriends(data.filter((f) => !memberIds.has(f.user_id)));
  }

  async function addMember(userId: string) {
    if (!conversationId) return;
    const { error } = await addGroupMembers(conversationId, [userId]);
    if (error) Alert.alert(t('chat.actionFailed'));
    setFriends((prev) => prev.filter((f) => f.user_id !== userId));
    await load();
  }

  function memberActions(member: GroupMember) {
    if (!conversationId || member.user_id === myUserId) return;
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];

    if (isOwner && member.role !== 'owner') {
      buttons.push({
        text: member.role === 'admin' ? t('chat.removeAdmin') : t('chat.makeAdmin'),
        onPress: async () => {
          const next: Exclude<GroupRole, 'owner'> = member.role === 'admin' ? 'member' : 'admin';
          const { error } = await setGroupMemberRole(conversationId, member.user_id, next);
          if (error) Alert.alert(t('chat.actionFailed'));
          else await load();
        },
      });
    }
    if (canManage && member.role !== 'owner') {
      buttons.push({
        text: t('chat.removeMember'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await removeGroupMember(conversationId, member.user_id);
          if (error) Alert.alert(t('chat.actionFailed'));
          else await load();
        },
      });
    }
    buttons.push({ text: t('chat.cancel'), style: 'cancel' });
    if (buttons.length > 1) {
      Alert.alert(member.nick?.trim() || t('common.nick'), undefined, buttons);
    }
  }

  function confirmLeave() {
    if (!conversationId) return;
    Alert.alert(t('chat.leaveGroup'), t('chat.confirmLeave'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.leaveGroup'),
        style: 'destructive',
        onPress: async () => {
          await leaveGroup(conversationId);
          router.replace('/messages');
        },
      },
    ]);
  }

  function confirmDelete() {
    if (!conversationId) return;
    Alert.alert(t('chat.deleteGroup'), t('chat.confirmDelete'), [
      { text: t('chat.cancel'), style: 'cancel' },
      {
        text: t('chat.deleteGroup'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteGroup(conversationId);
          if (error) Alert.alert(t('chat.actionFailed'));
          else router.replace('/messages');
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('chat.groupInfo')} onBack={() => goBack('/messages')} />
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('chat.groupInfo')}
        onBack={() => goBack(`/messages/${conversationId}`)}
        rightActions={
          canManage
            ? [
                {
                  key: 'add',
                  icon: '＋',
                  accessibilityLabel: t('chat.addMembers'),
                  onPress: () => void openAddMembers(),
                },
              ]
            : undefined
        }
      />

      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.head}>
            <ConversationAvatar kind="group" title={meta?.title ?? null} photoUrl={meta?.photo_url ?? null} size={88} />
            {editingTitle ? (
              <View style={styles.titleEditRow}>
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  style={styles.titleInput}
                  maxLength={80}
                  autoFocus
                />
                <Pressable onPress={() => void saveTitle()} style={styles.saveBtn}>
                  <Text style={styles.saveText}>{t('chat.save')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => (canManage ? setEditingTitle(true) : undefined)}
                style={styles.titleRow}>
                <Text style={styles.groupTitle}>{meta?.title?.trim() || t('common.nick')}</Text>
                {canManage ? <Text style={styles.editHint}>{t('chat.editTitle')}</Text> : null}
              </Pressable>
            )}
            <Text style={styles.memberCount}>
              {t('chat.members').replace('{count}', String(members.length))}
            </Text>
            <Text style={styles.sectionLabel}>{t('chat.membersTitle')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => memberActions(item)}
            style={({ pressed }) => [styles.memberRow, pressed && styles.pressed]}>
            <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={44} showOnline isOnline={item.is_online} />
            <Text style={styles.memberName} numberOfLines={1}>
              {item.nick?.trim() || t('common.nick')}
            </Text>
            <View style={[styles.roleBadge, item.role === 'owner' && styles.roleBadgeOwner]}>
              <Text style={[styles.roleText, item.role === 'owner' && styles.roleTextOwner]}>
                {roleLabel(item.role)}
              </Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable onPress={confirmLeave} style={styles.dangerBtn}>
              <Text style={styles.dangerText}>{t('chat.leaveGroup')}</Text>
            </Pressable>
            {isOwner ? (
              <Pressable onPress={confirmDelete} style={[styles.dangerBtn, styles.deleteBtn]}>
                <Text style={[styles.dangerText, styles.deleteText]}>{t('chat.deleteGroup')}</Text>
              </Pressable>
            ) : null}
          </View>
        }
      />

      {adding ? (
        <View style={styles.addOverlay}>
          <View style={[styles.addSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.addHeader}>
              <Text style={styles.addTitle}>{t('chat.addMembers')}</Text>
              <Pressable onPress={() => setAdding(false)} hitSlop={10}>
                <Text style={styles.addClose}>✕</Text>
              </Pressable>
            </View>
            <FlatList
              data={friends}
              keyExtractor={(item) => item.user_id}
              ListEmptyComponent={<Text style={styles.empty}>{t('chat.noResults')}</Text>}
              renderItem={({ item }) => (
                <Pressable onPress={() => void addMember(item.user_id)} style={styles.memberRow}>
                  <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={44} />
                  <Text style={styles.memberName} numberOfLines={1}>
                    {item.nick?.trim() || t('common.nick')}
                  </Text>
                  <Text style={styles.addPlus}>＋</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.surface },
  loader: { marginTop: 40 },
  head: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24 },
  titleInput: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: Brand.surfaceMuted,
    color: Brand.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  saveBtn: { backgroundColor: Brand.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  saveText: { color: Brand.primaryText, fontWeight: '700' },
  groupTitle: { fontSize: 22, fontWeight: '800', color: Brand.textPrimary },
  editHint: { fontSize: 13, color: Brand.primary },
  memberCount: { fontSize: 14, color: Brand.textMuted },
  sectionLabel: {
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    marginTop: 12,
    fontSize: 13,
    fontWeight: '700',
    color: Brand.textMuted,
    textTransform: 'uppercase',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: Brand.surfaceMuted },
  memberName: { flex: 1, fontSize: 16, fontWeight: '600', color: Brand.textPrimary },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: Brand.surfaceMuted,
  },
  roleBadgeOwner: { backgroundColor: Brand.primaryLight },
  roleText: { fontSize: 12, fontWeight: '600', color: Brand.textSecondary },
  roleTextOwner: { color: Brand.primary },
  footer: { padding: 16, gap: 12, marginTop: 12 },
  dangerBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: Brand.surfaceMuted,
  },
  dangerText: { fontSize: 15, fontWeight: '700', color: Brand.danger },
  deleteBtn: { backgroundColor: Brand.danger },
  deleteText: { color: '#fff' },
  empty: { color: Brand.textMuted, textAlign: 'center', marginTop: 24 },
  addOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  addSheet: {
    maxHeight: '70%',
    backgroundColor: Brand.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
  },
  addHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  addTitle: { fontSize: 17, fontWeight: '700', color: Brand.textPrimary },
  addClose: { fontSize: 18, color: Brand.textMuted },
  addPlus: { fontSize: 22, color: Brand.primary, fontWeight: '700' },
});
