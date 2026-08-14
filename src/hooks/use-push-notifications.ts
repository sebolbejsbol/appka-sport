import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { useSession } from '@/context/session';
import { getNotificationsEnabled } from '@/lib/notification-preferences';
import { getUpcomingEvents } from '@/lib/events';
import {
  clearPushTokenOnServer,
  configureNotificationHandler,
  getNotificationEventId,
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
      const eventId = getNotificationEventId(data);
      if (eventId) {
        router.push({ pathname: '/event/[id]', params: { id: eventId } });
        return;
      }
      if (
        (data.type === 'dm' || data.type === 'group_message' || data.type === 'message_reaction') &&
        typeof data.conversation_id === 'string'
      ) {
        router.push({ pathname: '/messages/[id]', params: { id: data.conversation_id } });
        return;
      }
      if (data.type === 'team_message' && typeof data.team_id === 'string') {
        router.push(`/teams/${data.team_id}/chat` as Href);
        return;
      }
      if (data.type === 'team_invite' && typeof data.team_id === 'string') {
        router.push(`/teams/${data.team_id}` as Href);
        return;
      }
      if (data.type === 'team_event_invite' && typeof data.event_id === 'string') {
        router.push({ pathname: '/event/[id]', params: { id: data.event_id } });
        return;
      }
      if (
        (data.type === 'post_like' ||
          data.type === 'post_comment' ||
          data.type === 'post_mention') &&
        typeof data.post_id === 'string'
      ) {
        router.push({ pathname: '/feed/post/[id]', params: { id: data.post_id } });
      }
    });
    return () => sub.remove();
  }, []);
}
