import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { t } from '@/i18n';
import type { EventListItem } from '@/lib/events';
import { saveExpoPushToken } from '@/lib/profiles';
import {
  getNotificationsEnabled,
  setNotificationsEnabled,
} from '@/lib/notification-preferences';

const ANDROID_CHANNEL_ID = 'events';
const ANDROID_MESSAGES_CHANNEL_ID = 'messages';

/** 20 min przed startem — otwarcie okna meldowania. */
export const CHECK_IN_REMINDER_MINUTES = 20;
/** 5 min przed startem — przypomnienie o starcie. */
export const EVENT_START_REMINDER_MINUTES = 5;

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function reminderId(eventId: string, kind: 'checkin' | 'start'): string {
  return `event-${eventId}-${kind}`;
}

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_device' | 'permission_denied' | 'no_project_id' | 'fcm_not_configured' | 'error' };

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice) return { ok: false, reason: 'not_device' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: t('push.channelName'),
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync(ANDROID_MESSAGES_CHANNEL_ID, {
      name: t('messages.pushTitle'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return { ok: false, reason: 'permission_denied' };

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (!projectId) return { ok: false, reason: 'no_project_id' };

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: token.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('googleServicesFile') || msg.includes('Firebase')) {
      return { ok: false, reason: 'fcm_not_configured' };
    }
    return { ok: false, reason: 'error' };
  }
}

export async function disablePushNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await clearPushTokenOnServer();
  await setNotificationsEnabled(false);
}

export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  const result = await registerForPushNotifications();
  if (!result.ok) return result;

  const { error } = await saveExpoPushToken(result.token);
  if (error) return { ok: false, reason: 'error' };

  await setNotificationsEnabled(true);
  return result;
}

export async function syncPushTokenWithServer(): Promise<boolean> {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return false;

  const result = await registerForPushNotifications();
  if (!result.ok) return false;
  const { error } = await saveExpoPushToken(result.token);
  return !error;
}

export async function getNotificationPermissionState(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

export async function clearPushTokenOnServer(): Promise<void> {
  await saveExpoPushToken(null);
}

async function scheduleReminder(opts: {
  eventId: string;
  kind: 'checkin' | 'start';
  fireAt: Date;
  title: string;
  body: string;
}): Promise<void> {
  if (opts.fireAt.getTime() <= Date.now()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: reminderId(opts.eventId, opts.kind),
    content: {
      title: opts.title,
      body: opts.body,
      data: { eventId: opts.eventId, type: opts.kind },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: opts.fireAt,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
    },
  });
}

export async function cancelEventReminders(eventId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(eventId, 'checkin'));
  await Notifications.cancelScheduledNotificationAsync(reminderId(eventId, 'start'));
}

export async function scheduleEventReminders(event: {
  id: string;
  title: string | null;
  starts_at: string;
}): Promise<void> {
  const enabled = await getNotificationsEnabled();
  if (!enabled) return;

  const startsAt = new Date(event.starts_at);
  if (Number.isNaN(startsAt.getTime())) return;

  await cancelEventReminders(event.id);

  const label = event.title?.trim() || t('push.defaultEventName');
  const checkInAt = new Date(startsAt.getTime() - CHECK_IN_REMINDER_MINUTES * 60_000);
  const startAt = new Date(startsAt.getTime() - EVENT_START_REMINDER_MINUTES * 60_000);

  await scheduleReminder({
    eventId: event.id,
    kind: 'checkin',
    fireAt: checkInAt,
    title: t('push.checkInTitle'),
    body: t('push.checkInBody').replace('{event}', label),
  });

  await scheduleReminder({
    eventId: event.id,
    kind: 'start',
    fireAt: startAt,
    title: t('push.startTitle'),
    body: t('push.startBody').replace('{event}', label),
  });
}

export async function syncLocalEventReminders(events: EventListItem[]): Promise<void> {
  const planned = events.filter((e) => e.status === 'planned');
  for (const event of planned) {
    await scheduleEventReminders(event);
  }
}

export function getNotificationEventId(
  data: Record<string, unknown> | undefined,
): string | null {
  const raw = data?.eventId;
  if (typeof raw === 'string' && raw) return raw;
  if (typeof raw === 'number') return String(raw);
  return null;
}
