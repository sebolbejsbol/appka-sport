import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { UserAvatar } from '@/components/user-avatar';
import { Brand, BrandFonts } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { listBlockedUsers, unblockUser, type BlockedUserRow } from '@/lib/moderation';
import { notifyError } from '@/lib/toast';

export default function BlockedUsersScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<BlockedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await listBlockedUsers();
    setRows(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  function openUser(userId: string) {
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  async function handleUnblock(row: BlockedUserRow) {
    setBusyId(row.user_id);
    const result = await unblockUser(row.user_id);
    setBusyId(null);
    if (result !== 'unblocked') {
      notifyError(t('moderation.unblockFailed'));
      return;
    }
    setRows((prev) => prev.filter((item) => item.user_id !== row.user_id));
  }

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('settings.blockedUsersTitle')}
        onBack={() => goBack('/settings')}
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('settings.blockedUsersEmpty')}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const displayName = item.nick?.trim() || t('common.nick');
            return (
              <View style={styles.row}>
                <Pressable onPress={() => openUser(item.user_id)}>
                  <UserAvatar nick={item.nick} avatarUrl={item.avatar_url} size={44} />
                </Pressable>
                <Pressable
                  style={styles.rowMain}
                  onPress={() => openUser(item.user_id)}>
                  <Text style={styles.name}>{displayName}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleUnblock(item)}
                  disabled={busyId === item.user_id}
                  style={({ pressed }) => [
                    styles.unblockBtn,
                    pressed && styles.pressed,
                    busyId === item.user_id && styles.unblockBtnDisabled,
                  ]}>
                  <Text style={styles.unblockBtnText}>{t('moderation.unblock')}</Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Brand.screenBackground,
  },
  loader: {
    marginTop: 32,
  },
  empty: {
    color: Brand.textMuted,
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
    fontSize: 15,
    fontFamily: BrandFonts.body,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  rowMain: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: BrandFonts.bodyBold,
    color: Brand.textPrimary,
  },
  unblockBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  unblockBtnDisabled: {
    opacity: 0.5,
  },
  unblockBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: BrandFonts.bodySemibold,
    color: Brand.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
});
