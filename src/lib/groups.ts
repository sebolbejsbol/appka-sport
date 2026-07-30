import { supabase } from '@/lib/supabase';

export type GroupRole = 'owner' | 'admin' | 'member';

export type GroupMember = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  role: GroupRole;
  joined_at: string;
  is_online: boolean;
};

/** Tworzy grupę; twórca zostaje właścicielem. Zwraca conversation_id. */
export async function createGroup(
  title: string,
  memberIds: string[],
): Promise<{ data: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('create_group', {
    p_title: title.trim(),
    p_member_ids: memberIds,
  });
  if (error) return { data: null, error };
  return { data: typeof data === 'string' ? data : null, error: null };
}

export async function setGroupTitle(
  conversationId: string,
  title: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_group_title', {
    p_conversation_id: conversationId,
    p_title: title.trim(),
  });
  return { error };
}

export async function setGroupPhoto(
  conversationId: string,
  photoUrl: string | null,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_group_photo', {
    p_conversation_id: conversationId,
    p_photo_url: photoUrl,
  });
  return { error };
}

export async function addGroupMembers(
  conversationId: string,
  userIds: string[],
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('add_group_members', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });
  return { error };
}

export async function removeGroupMember(
  conversationId: string,
  userId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  return { error };
}

export async function setGroupMemberRole(
  conversationId: string,
  userId: string,
  role: Exclude<GroupRole, 'owner'>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('set_group_member_role', {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_role: role,
  });
  return { error };
}

export async function leaveGroup(
  conversationId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('leave_group', { p_conversation_id: conversationId });
  return { error };
}

export async function deleteGroup(
  conversationId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('delete_group', { p_conversation_id: conversationId });
  return { error };
}

export async function listGroupMembers(
  conversationId: string,
): Promise<{ data: GroupMember[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('group_members', {
    p_conversation_id: conversationId,
  });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((r) => ({
      user_id: String(r.user_id ?? ''),
      nick: typeof r.nick === 'string' ? r.nick : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      role: (r.role === 'owner' || r.role === 'admin' ? r.role : 'member') as GroupRole,
      joined_at: String(r.joined_at ?? ''),
      is_online: Boolean(r.is_online),
    })),
    error: null,
  };
}
