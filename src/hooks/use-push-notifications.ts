import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useSession } from '@/context/session';
import { getNotificationsEnabled } from '@/lib/notification-preferences';
import { getUpcomingEvents } from '@/lib/events';
import {
  clearPushTokenOnServer,
  configureNotificationHandler,
  routeForPushData,
  syncLocalEventReminders,
  syncPushTokenWithServer,
} from '@/lib/push-notifications';

configureNotificationHandler();

export function usePushNotifications(): void {
  const { session } = useSession();
  const userId = session?.user?.id;
  const remindersSyncedRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      remindersSyncedRef.current = false;
      void clearPushTokenOnServer();
      return;
    }

    void (async () => {
      const enabled = await getNotificationsEnabled();
      if (!enabled) return;

      await syncPushTokenWithServer();

      if (!remindersSyncedRef.current) {
        remindersSyncedRef.current = true;
        const { data } = await getUpcomingEvents('mine');
        await syncLocalEventReminders(data);
      }
    })();
  }, [userId]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      routeForPushData(data);
    });
    return () => sub.remove();
  }, []);
}
