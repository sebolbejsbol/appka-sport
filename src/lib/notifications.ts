import { supabase } from '@/lib/supabase';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function mapNotificationRow(raw: Record<string, unknown>): AppNotification {
  return {
    id: String(raw.id ?? ''),
    type: typeof raw.type === 'string' ? raw.type : '',
    title: typeof raw.title === 'string' ? raw.title : '',
    body: typeof raw.body === 'string' ? raw.body : null,
    data: (raw.data as Record<string, unknown> | null) ?? {},
    read_at: typeof raw.read_at === 'string' ? raw.read_at : null,
    created_at: String(raw.created_at ?? ''),
  };
}

export async function listMyNotifications(
  limit = 50,
): Promise<{ data: AppNotification[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_my_notifications', { p_limit: limit });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapNotificationRow),
    error: null,
  };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_notification_count');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  return !error;
}

export async function markAllNotificationsRead(): Promise<boolean> {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  return !error;
}

let notificationsChannelSeq = 0;

/** Powiadamia o nowym powiadomieniu (INSERT) dla bieżącego użytkownika — RLS ogranicza do jego wierszy. */
export function subscribeToMyNotifications(onInsert: (n: AppNotification) => void): () => void {
  const channel = supabase
    .channel(`notifications:${++notificationsChannelSeq}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => onInsert(mapNotificationRow(payload.new as Record<string, unknown>)),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Renderowalny tekst dla powiadomienia, zależny od `type` — patrz notifications RPC. */
export function notificationDisplayText(
  n: AppNotification,
  t: (key: 'notifications.favoriteCourtEventTitle' | 'notifications.favoriteCourtEventBody') => string,
): { title: string; body: string } {
  if (n.type === 'favorite_court_event') {
    const fieldName = typeof n.data.field_name === 'string' && n.data.field_name ? n.data.field_name : n.title;
    const eventTitle =
      typeof n.data.event_title === 'string' && n.data.event_title ? n.data.event_title : n.body;
    return {
      title: `${t('notifications.favoriteCourtEventTitle')}: ${fieldName}`,
      body: eventTitle ?? t('notifications.favoriteCourtEventBody'),
    };
  }
  return { title: n.title, body: n.body ?? '' };
}
