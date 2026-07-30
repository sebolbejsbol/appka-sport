import { supabase } from '@/lib/supabase';

export type FriendRequestStatus = 'none' | 'sent' | 'received';

export type ProfileSport = 'basketball' | 'football' | 'volleyball' | 'handball';
export type ProfileSkillLevel = 'beginner' | 'intermediate' | 'advanced';

export type PublicProfile = {
  id: string;
  nick: string | null;
  avatar_url: string | null;
  country_code: string | null;
  city: string | null;
  bio: string | null;
  favorite_sport: ProfileSport | null;
  skill_level: ProfileSkillLevel | null;
  friend_count: number;
  events_played: number;
  events_created: number;
  attendance_rate: number;
  events_together: number;
  avg_rating: number | null;
  achievements: string[];
  is_friend: boolean;
  can_message: boolean;
  friend_request_status: FriendRequestStatus;
  is_online: boolean;
  is_self: boolean;
};

export type SocialUserRow = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  is_online: boolean;
  friends_since?: string;
};

export type IncomingFriendRequest = {
  request_id: string;
  from_user_id: string;
  nick: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type OutgoingFriendRequest = {
  request_id: string;
  to_user_id: string;
  nick: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type ProfileSearchHit = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
};

export type SocialActionResult =
  | 'ok'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'removed'
  | 'already_friends'
  | 'request_pending'
  | 'not_authenticated'
  | 'not_found'
  | 'error';

function mapPublicProfile(raw: Record<string, unknown>): PublicProfile | null {
  if (raw.error) return null;

  const sport = raw.favorite_sport;
  const validSport =
    sport === 'basketball' ||
    sport === 'football' ||
    sport === 'volleyball' ||
    sport === 'handball'
      ? sport
      : null;

  const skill = raw.skill_level;
  const validSkill =
    skill === 'beginner' || skill === 'intermediate' || skill === 'advanced'
      ? skill
      : null;

  return {
    id: String(raw.id ?? ''),
    nick: typeof raw.nick === 'string' ? raw.nick : null,
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    country_code: typeof raw.country_code === 'string' ? raw.country_code : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    bio: typeof raw.bio === 'string' ? raw.bio : null,
    favorite_sport: validSport,
    skill_level: validSkill,
    friend_count: Number(raw.friend_count) || 0,
    events_played: Number(raw.events_played) || 0,
    events_created: Number(raw.events_created) || 0,
    attendance_rate: Number(raw.attendance_rate) || 0,
    events_together: Number(raw.events_together) || 0,
    avg_rating: typeof raw.avg_rating === 'number' ? raw.avg_rating : null,
    achievements: Array.isArray(raw.achievements)
      ? raw.achievements.filter((a): a is string => typeof a === 'string')
      : [],
    is_friend: Boolean(raw.is_friend),
    can_message: Boolean(raw.can_message),
    friend_request_status:
      raw.friend_request_status === 'sent' || raw.friend_request_status === 'received'
        ? raw.friend_request_status
        : 'none',
    is_online: Boolean(raw.is_online),
    is_self: Boolean(raw.is_self),
  };
}

export async function touchLastSeen(): Promise<void> {
  await supabase.rpc('touch_last_seen');
}

export async function getPublicProfile(
  userId: string,
): Promise<{
  data: PublicProfile | null;
  error: { message: string } | null;
  blocked?: { iBlockedThem: boolean };
}> {
  const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: userId });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  const raw = data as Record<string, unknown>;
  if (raw.error === 'blocked') {
    return {
      data: null,
      error: null,
      blocked: { iBlockedThem: Boolean(raw.i_blocked_them) },
    };
  }
  if (raw.error) return { data: null, error: { message: String(raw.error) } };
  return {
    data: mapPublicProfile(raw),
    error: null,
  };
}

export async function listFriends(): Promise<{
  data: SocialUserRow[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_friends');
  if (error) return { data: [], error };
  return { data: (data as SocialUserRow[] | null) ?? [], error: null };
}

export async function listIncomingFriendRequests(): Promise<{
  data: IncomingFriendRequest[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_friend_requests_incoming');
  if (error) return { data: [], error };
  return { data: (data as IncomingFriendRequest[] | null) ?? [], error: null };
}

export async function listOutgoingFriendRequests(): Promise<{
  data: OutgoingFriendRequest[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_friend_requests_outgoing');
  if (error) return { data: [], error };
  return { data: (data as OutgoingFriendRequest[] | null) ?? [], error: null };
}

export async function cancelFriendRequest(
  requestId: string,
): Promise<SocialActionResult | 'cancelled' | 'not_sender'> {
  const { data, error } = await supabase.rpc('cancel_friend_request', {
    p_request_id: requestId,
  });
  if (error) return 'error';
  return (data as SocialActionResult | 'cancelled' | 'not_sender' | null) ?? 'error';
}

export async function searchProfiles(
  query: string,
): Promise<{ data: ProfileSearchHit[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('search_profiles', { p_query: query.trim() });
  if (error) return { data: [], error };
  return { data: (data as ProfileSearchHit[] | null) ?? [], error: null };
}

export async function sendFriendRequest(userId: string): Promise<SocialActionResult> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_to_user_id: userId });
  if (error) return 'error';
  return (data as SocialActionResult | null) ?? 'error';
}

export async function respondFriendRequest(
  requestId: string,
  accept: boolean,
): Promise<SocialActionResult> {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as SocialActionResult | null) ?? 'error';
}

export async function removeFriend(userId: string): Promise<SocialActionResult> {
  const { data, error } = await supabase.rpc('remove_friend', { p_friend_id: userId });
  if (error) return 'error';
  return (data as SocialActionResult | null) ?? 'error';
}
