import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { formatRelativeShortTime } from '@/lib/datetime';
import { goBack } from '@/lib/navigation';
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDisplayText,
  subscribeToMyNotifications,
  type AppNotification,
} from '@/lib/notifications';
import { notifyError } from '@/lib/toast';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listMyNotifications();
    setRows(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    return subscribeToMyNotifications((n) => {
      setRows((prev) => (prev.some((row) => row.id === n.id) ? prev : [n, ...prev]));
    });
  }, []);

  async function handlePress(item: AppNotification) {
    if (!item.read_at) {
      setRows((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)),
      );
      void markNotificationRead(item.id);
    }
    const eventId = item.data.event_id;
    if (typeof eventId === 'string' && eventId) {
      router.push({ pathname: '/event/[id]', params: { id: eventId } });
    }
  }

  async function handleMarkAllRead() {
    setRows((prev) => prev.map((row) => ({ ...row, read_at: row.read_at ?? new Date().toISOString() })));
    const ok = await markAllNotificationsRead();
    if (!ok) notifyError(t('notifications.loadError'));
    void getUnreadNotificationCount();
  }

  const hasUnread = rows.some((row) => !row.read_at);

  return (
    <View style={[styles.flex, { paddingBottom: insets.bottom }]}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('notifications.title')}
        onBack={() => goBack('/')}
        rightActions={
          hasUnread
            ? [
                {
                  key: 'mark-all',
                  icon: '✓',
                  accessibilityLabel: t('notifications.markAllRead'),
                  onPress: () => void handleMarkAllRead(),
                },
              ]
            : undefined
        }
      />

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.empty}>{t('notifications.loadError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('notifications.empty')}</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const { title, body } = notificationDisplayText(item, t);
            const unread = !item.read_at;
            return (
              <Pressable
                onPress={() => void handlePress(item)}
                style={({ pressed }) => [styles.row, unread && styles.rowUnread, pressed && styles.pressed]}>
                {unread ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                <View style={styles.rowMain}>
                  <Text style={styles.title} numberOfLines={1}>{title}</Text>
                  {body ? <Text style={styles.body} numberOfLines={2}>{body}</Text> : null}
                  <Text style={styles.time}>{formatRelativeShortTime(item.created_at)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  empty: { color: Brand.textMuted, textAlign: 'center', marginTop: 32, paddingHorizontal: 24, fontSize: 15 },
  list: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Brand.border,
  },
  rowUnread: { backgroundColor: Brand.primaryLight },
  pressed: { opacity: 0.85 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Brand.primary,
    marginTop: 6,
  },
  dotSpacer: { width: 8, height: 8, marginTop: 6 },
  rowMain: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  body: { fontSize: 13, color: Brand.textSecondary },
  time: { fontSize: 12, color: Brand.textMuted, marginTop: 2 },
});
