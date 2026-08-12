-- Adds tables needed for app-wide realtime sync (Wave 3) to the
-- supabase_realtime publication. All of these already have RLS enabled
-- with SELECT policies that scope rows to what the subscriber may see
-- (own notifications/friendships/friend_requests, or public event data),
-- so postgres_changes delivery stays authorization-safe.

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.event_participants;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.friendships;
