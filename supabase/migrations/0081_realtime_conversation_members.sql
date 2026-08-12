-- Adds conversation_members to the realtime publication so the messages
-- inbox list can react to unread/last-read-at changes (e.g. read on another
-- device) without a manual refresh. RLS already scopes visible rows to
-- fellow members of the same conversation.

alter publication supabase_realtime add table public.conversation_members;
