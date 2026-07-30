import { supabase } from '@/lib/supabase';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

export type BlockedUserRow = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  blocked_at: string;
};

export type ModerationResult =
  | 'blocked'
  | 'unblocked'
  | 'not_blocked'
  | 'reported'
  | 'invalid_user'
  | 'invalid_reason'
  | 'user_not_found'
  | 'not_authenticated'
  | 'error';

export async function blockUser(userId: string): Promise<ModerationResult> {
  const { data, error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) return 'error';
  return (data as ModerationResult | null) ?? 'error';
}

export async function unblockUser(userId: string): Promise<ModerationResult> {
  const { data, error } = await supabase.rpc('unblock_user', { p_user_id: userId });
  if (error) return 'error';
  return (data as ModerationResult | null) ?? 'error';
}

export async function reportUser(
  userId: string,
  reason: ReportReason,
  details?: string,
): Promise<ModerationResult> {
  const { data, error } = await supabase.rpc('report_user', {
    p_user_id: userId,
    p_reason: reason,
    p_details: details?.trim() || null,
  });
  if (error) return 'error';
  return (data as ModerationResult | null) ?? 'error';
}

export async function listBlockedUsers(): Promise<{
  data: BlockedUserRow[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_blocked_users');
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((row) => ({
      user_id: String(row.user_id ?? ''),
      nick: typeof row.nick === 'string' ? row.nick : null,
      avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
      blocked_at: String(row.blocked_at ?? ''),
    })),
    error: null,
  };
}
