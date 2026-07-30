import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { createGroup } from '@/lib/groups';
import { goBack } from '@/lib/navigation';
import { listFriends, type SocialUserRow } from '@/lib/social';

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [friends, setFriends] = useState<SocialUserRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await listFriends();
      setFriends(data);
      setLoading(false);
    })();
  }, []);

  const toggle = useCallback((userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const canCreate = title.trim().length > 0 && selected.size > 0 && !creating;

  async function handleCreate() {
    if (!canCreate) return;
    setCreating(true);
    const { data, error } = await createGroup(title, Array.from(selected));
    setCreating(false);
    if (error || !data) {
      Alert.alert(t('messages.loadError'));
      return;
    }
    router.replace({ pathname: '/messages/[id]', params: { id: data } });
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('chat.newGroup')}
        onBack={() => goBack('/messages')}
        rightActions={[
          {
            key: 'create',
            icon: '✓',
            primary: true,
            accessibilityLabel: t('chat.newGroup'),
            onPress: () => void handleCreate(),
          },
        ]}
      />

      <View style={styles.titleWrap}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t('chat.newGroup')}
          placeholderTextColor={Brand.textMuted}
          style={styles.titleInput}
          maxLength={80}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={friends}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.emptyList')}</Text>}
          renderItem={({ item }) => {
            const isOn = selected.has(item.user_id);
            return (
              <Pressable
                onPress={() => toggle(item.user_id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={48} />
                <Text style={styles.name} numberOfLines={1}>
                  {item.nick?.trim() || t('common.nick')}
                </Text>
                <View style={[styles.check, isOn && styles.checkOn]}>
                  {isOn ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {creating ? (
        <View style={styles.creatingOverlay}>
          <ActivityIndicator color={Brand.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.surface },
  titleWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  titleInput: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: Brand.surfaceMuted,
    color: Brand.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  loader: { marginTop: 32 },
  empty: { color: Brand.textMuted, textAlign: 'center', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: Brand.surfaceMuted },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: Brand.textPrimary },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  checkMark: { color: Brand.primaryText, fontWeight: '800', fontSize: 14 },
  creatingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
});
