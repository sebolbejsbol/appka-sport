import { supabase } from '@/lib/supabase';

export type TeamRole = 'owner' | 'admin' | 'member';

export type TeamListItem = {
  team_id: string;
  name: string;
  logo_url: string | null;
  sport: string;
  my_role: TeamRole;
  member_count: number;
  unread_count: number;
};

export type ActiveTeam = {
  team_id: string;
  name: string;
  logo_url: string | null;
  sport: string;
  member_count: number;
};

export type DiscoverTeam = {
  team_id: string;
  name: string;
  logo_url: string | null;
  sport: string;
  member_count: number;
  is_member: boolean;
  request_status: 'pending' | 'accepted' | 'rejected' | null;
};

export type TeamJoinRequest = {
  request_id: string;
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  created_at: string;
};

function mapDiscoverTeam(r: Record<string, unknown>): DiscoverTeam {
  const status = typeof r.request_status === 'string' ? r.request_status : null;
  return {
    team_id: String(r.team_id ?? ''),
    name: typeof r.name === 'string' ? r.name : '',
    logo_url: typeof r.logo_url === 'string' ? r.logo_url : null,
    sport: typeof r.sport === 'string' ? r.sport : '',
    member_count: Number(r.member_count) || 0,
    is_member: Boolean(r.is_member),
    request_status:
      status === 'pending' || status === 'accepted' || status === 'rejected' ? status : null,
  };
}

export async function searchTeams(query: string, limit = 30): Promise<DiscoverTeam[]> {
  const { data, error } = await supabase.rpc('search_teams', {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map(mapDiscoverTeam);
}

export async function getSuggestedTeams(limit = 10): Promise<DiscoverTeam[]> {
  const { data, error } = await supabase.rpc('suggested_teams', { p_limit: limit });
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map(mapDiscoverTeam);
}

export async function requestJoinTeam(teamId: string): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('request_join_team', { p_team_id: teamId });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function cancelJoinRequest(teamId: string): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('cancel_join_request', { p_team_id: teamId });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function listTeamJoinRequests(teamId: string): Promise<{
  data: TeamJoinRequest[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_team_join_requests', { p_team_id: teamId });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      request_id: String(r.request_id ?? ''),
      user_id: String(r.user_id ?? ''),
      nick: typeof r.nick === 'string' ? r.nick : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      created_at: String(r.created_at ?? ''),
    })),
    error: null,
  };
}

export async function respondTeamJoinRequest(
  requestId: string,
  accept: boolean,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('respond_team_join_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function getActiveTeams(limit = 5): Promise<ActiveTeam[]> {
  const { data, error } = await supabase.rpc('active_teams', { p_limit: limit });
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    team_id: String(r.team_id ?? ''),
    name: typeof r.name === 'string' ? r.name : '',
    logo_url: typeof r.logo_url === 'string' ? r.logo_url : null,
    sport: typeof r.sport === 'string' ? r.sport : '',
    member_count: Number(r.member_count) || 0,
  }));
}

export type TeamMember = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  role: TeamRole;
  is_online: boolean;
  joined_at: string;
};

export type TeamDetail = {
  team_id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  sport: string;
  owner_id: string;
  created_at: string;
  my_role: TeamRole;
  can_manage: boolean;
  is_owner: boolean;
  conversation_id: string | null;
  member_count: number;
  members: TeamMember[];
};

export type IncomingTeamInvitation = {
  invitation_id: string;
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
  from_user_id: string;
  from_nick: string | null;
  created_at: string;
};

export type EventTeamInvitation = {
  invitation_id: string;
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
  member_count: number;
  accepted_count: number;
  declined_count: number;
  pending_count: number;
  invited_at: string;
};

export type PendingTeamEventInvite = {
  invitation_id: string;
  event_id: string;
  event_title: string | null;
  event_starts_at: string;
  team_id: string;
  team_name: string;
  status: string;
};

export type TeamActionResult =
  | 'ok'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'removed'
  | 'forbidden'
  | 'not_found'
  | 'not_member'
  | 'already_member'
  | 'request_pending'
  | 'owner_cannot_leave'
  | 'cannot_remove_owner'
  | 'invalid_user'
  | 'invalid_role'
  | 'user_not_found'
  | 'not_authenticated'
  | 'already_invited'
  | 'accepted_no_join'
  | 'declined'
  | 'not_team_member'
  | 'error';

function mapTeamDetail(raw: Record<string, unknown>): TeamDetail | null {
  if (raw.error) return null;
  const members = Array.isArray(raw.members) ? raw.members : [];
  return {
    team_id: String(raw.team_id ?? ''),
    name: String(raw.name ?? ''),
    description: typeof raw.description === 'string' ? raw.description : null,
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : null,
    sport: String(raw.sport ?? 'basketball'),
    owner_id: String(raw.owner_id ?? ''),
    created_at: String(raw.created_at ?? ''),
    my_role: (raw.my_role as TeamRole) ?? 'member',
    can_manage: Boolean(raw.can_manage),
    is_owner: Boolean(raw.is_owner),
    conversation_id:
      typeof raw.conversation_id === 'string' ? raw.conversation_id : null,
    member_count: Number(raw.member_count) || 0,
    members: members.map((m) => {
      const row = m as Record<string, unknown>;
      return {
        user_id: String(row.user_id ?? ''),
        nick: typeof row.nick === 'string' ? row.nick : null,
        avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
        role: (row.role as TeamRole) ?? 'member',
        is_online: Boolean(row.is_online),
        joined_at: String(row.joined_at ?? ''),
      };
    }),
  };
}

export async function listMyTeams(): Promise<{
  data: TeamListItem[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_my_teams');
  if (error) return { data: [], error };
  return { data: (data as TeamListItem[] | null) ?? [], error: null };
}

export async function getTeamDetail(
  teamId: string,
): Promise<{ data: TeamDetail | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_team_detail', { p_team_id: teamId });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  return {
    data: mapTeamDetail(data as Record<string, unknown>),
    error: null,
  };
}

export async function createTeam(input: {
  name: string;
  description?: string;
  sport: string;
  logoUrl?: string | null;
}): Promise<{ teamId: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('create_team', {
    p_name: input.name.trim(),
    p_description: input.description?.trim() || null,
    p_sport: input.sport,
    p_logo_url: input.logoUrl?.trim() || null,
  });
  if (error) return { teamId: null, error };
  if (data == null || data === '') {
    return { teamId: null, error: { message: 'empty_response' } };
  }
  return { teamId: String(data), error: null };
}

export async function updateTeam(
  teamId: string,
  input: {
    name?: string;
    description?: string | null;
    sport?: string;
    logoUrl?: string | null;
  },
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('update_team', {
    p_team_id: teamId,
    p_name: input.name?.trim() ?? null,
    p_description: input.description === undefined ? null : input.description,
    p_sport: input.sport ?? null,
    p_logo_url: input.logoUrl === undefined ? null : input.logoUrl,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function listIncomingTeamInvitations(): Promise<{
  data: IncomingTeamInvitation[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_team_invitations_incoming');
  if (error) return { data: [], error };
  return { data: (data as IncomingTeamInvitation[] | null) ?? [], error: null };
}

export async function inviteToTeam(
  teamId: string,
  userId: string,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('invite_to_team', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function respondTeamInvitation(
  invitationId: string,
  accept: boolean,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('respond_team_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('remove_team_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function setTeamMemberRole(
  teamId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('set_team_member_role', {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function deleteTeam(teamId: string): Promise<TeamActionResult | 'deleted'> {
  const { data, error } = await supabase.rpc('delete_team', { p_team_id: teamId });
  if (error) return 'error';
  return (data as TeamActionResult | 'deleted' | null) ?? 'error';
}

export async function transferTeamOwnership(
  teamId: string,
  newOwnerId: string,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('transfer_team_ownership', {
    p_team_id: teamId,
    p_new_owner_id: newOwnerId,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function ensureTeamConversation(
  teamId: string,
): Promise<{ conversationId: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('ensure_team_conversation', {
    p_team_id: teamId,
  });
  if (error) return { conversationId: null, error };
  return { conversationId: typeof data === 'string' ? data : null, error: null };
}

export async function getTeamChatHeader(teamId: string): Promise<{
  data: {
    team_id: string;
    team_name: string;
    team_logo_url: string | null;
    sport: string;
    conversation_id: string | null;
  } | null;
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('get_team_chat_header', { p_team_id: teamId });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  const raw = data as Record<string, unknown>;
  if (raw.error) return { data: null, error: null };
  return {
    data: {
      team_id: String(raw.team_id ?? ''),
      team_name: String(raw.team_name ?? ''),
      team_logo_url: typeof raw.team_logo_url === 'string' ? raw.team_logo_url : null,
      sport: String(raw.sport ?? 'basketball'),
      conversation_id:
        typeof raw.conversation_id === 'string' ? raw.conversation_id : null,
    },
    error: null,
  };
}

export async function shareEventInTeamChat(
  teamId: string,
  eventId: string,
): Promise<{ messageId: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('share_event_in_team_chat', {
    p_team_id: teamId,
    p_event_id: eventId,
  });
  if (error) return { messageId: null, error };
  return { messageId: typeof data === 'string' ? data : null, error: null };
}

export async function inviteTeamToEvent(
  eventId: string,
  teamId: string,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('invite_team_to_event', {
    p_event_id: eventId,
    p_team_id: teamId,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function respondTeamEventInvitation(
  invitationId: string,
  accept: boolean,
): Promise<TeamActionResult> {
  const { data, error } = await supabase.rpc('respond_team_event_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as TeamActionResult | null) ?? 'error';
}

export async function listEventTeamInvitations(eventId: string): Promise<{
  data: EventTeamInvitation[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_event_team_invitations', {
    p_event_id: eventId,
  });
  if (error) return { data: [], error };
  return { data: (data as EventTeamInvitation[] | null) ?? [], error: null };
}

export async function listMyPendingTeamEventInvitations(): Promise<{
  data: PendingTeamEventInvite[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_my_pending_team_event_invitations');
  if (error) return { data: [], error };
  return { data: (data as PendingTeamEventInvite[] | null) ?? [], error: null };
}
