import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/lib/profiles';

export type AdminUserRow = {
  id: string;
  nick: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole;
  created_at: string;
};

export type SetUserRoleResult =
  | 'ok'
  | 'not_authenticated'
  | 'not_super_admin'
  | 'invalid_role'
  | 'not_found'
  | 'target_is_super_admin'
  | 'no_change'
  | 'error';

function mapUserRow(raw: Record<string, unknown>): AdminUserRow {
  const role = raw.role;
  const validRole: AppRole = role === 'admin' || role === 'super_admin' ? role : 'user';

  return {
    id: String(raw.id ?? ''),
    nick: typeof raw.nick === 'string' ? raw.nick : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    role: validRole,
    created_at: String(raw.created_at ?? ''),
  };
}

export async function getAdminUserList(
  search: string,
  roleFilter: AppRole | null,
  limit = 50,
  offset = 0,
): Promise<{ data: AdminUserRow[]; totalCount: number; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search.trim() || null,
    p_role_filter: roleFilter,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { data: [], totalCount: 0, error };

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  return { data: rows.map(mapUserRow), totalCount, error: null };
}

export async function setUserRole(
  userId: string,
  role: 'user' | 'admin',
): Promise<SetUserRoleResult> {
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return 'error';
  return (data as SetUserRoleResult | null) ?? 'error';
}
