import { Brand } from '@/constants/theme';
import type { LngLat } from '@/hooks/use-user-location';
import { supabase } from '@/lib/supabase';

/** Status gracza w trybie „Szukaj teraz". */
export type PlayStatus = 'offline' | 'looking' | 'playing_today';

/** Poziom gry (opcjonalny filtr). */
export type PlayNowSkill = 'beginner' | 'intermediate' | 'advanced';

/** Osoba w kolejce „Szukaj teraz" (poszukiwacz gry). */
export type PlaySeeker = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  category: string;
  sport: string | null;
  skill: string | null;
  note: string | null;
  distance_m: number | null;
  created_at: string;
  is_online: boolean;
};

export type JoinQueueParams = {
  category: string;
  sport: string | null;
  skill: PlayNowSkill | null;
  coords: LngLat | null;
  note?: string | null;
};

function mapSeeker(raw: Record<string, unknown>): PlaySeeker {
  return {
    user_id: String(raw.user_id ?? ''),
    nick: typeof raw.nick === 'string' ? raw.nick : null,
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    category: typeof raw.category === 'string' ? raw.category : 'sport',
    sport: typeof raw.sport === 'string' ? raw.sport : null,
    skill: typeof raw.skill === 'string' ? raw.skill : null,
    note: typeof raw.note === 'string' ? raw.note : null,
    distance_m: typeof raw.distance_m === 'number' ? raw.distance_m : null,
    created_at: String(raw.created_at ?? ''),
    is_online: Boolean(raw.is_online),
  };
}

/** Dołącza do kolejki poszukiwaczy z wybranymi kryteriami (status → „szukam gry"). */
export async function joinPlayQueue(
  params: JoinQueueParams,
): Promise<{ ok: boolean; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('join_play_queue', {
    p_category: params.category,
    p_sport: params.sport,
    p_skill: params.skill,
    p_lat: params.coords ? params.coords[1] : null,
    p_lng: params.coords ? params.coords[0] : null,
    p_note: params.note ?? null,
  });
  if (error) return { ok: false, error };
  return { ok: data === 'ok', error: null };
}

/** Opuszcza kolejkę poszukiwaczy (status → „offline"). */
export async function leavePlayQueue(): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.rpc('leave_play_queue');
  return { error };
}

/** Lista aktywnych poszukiwaczy (posortowana wg odległości). */
export async function listPlaySeekers(params: {
  coords: LngLat | null;
  category?: string | null;
  sport: string | null;
  limit?: number;
}): Promise<{ data: PlaySeeker[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_play_seekers', {
    p_lat: params.coords ? params.coords[1] : null,
    p_lng: params.coords ? params.coords[0] : null,
    p_category: params.category ?? null,
    p_sport: params.sport,
    p_limit: params.limit ?? 50,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapSeeker),
    error: null,
  };
}

/** Ustawia status gracza (offline / szukam gry / gram dzisiaj). */
export async function setPlayStatus(status: PlayStatus): Promise<PlayStatus | 'error'> {
  const { data, error } = await supabase.rpc('set_play_status', { p_status: status });
  if (error) return 'error';
  return (data as PlayStatus | null) ?? 'error';
}

/** Odczytuje własny status gracza. */
export async function getMyPlayStatus(): Promise<PlayStatus> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return 'offline';
  const { data } = await supabase
    .from('profiles')
    .select('play_status')
    .eq('id', uid)
    .maybeSingle<{ play_status: PlayStatus }>();
  return data?.play_status ?? 'offline';
}

export const PLAY_STATUS_META: Record<PlayStatus, { label: string; color: string; dot: string }> = {
  offline: { label: 'Offline', color: '#94a3b8', dot: '#94a3b8' },
  looking: { label: 'Szukam gry', color: Brand.success, dot: Brand.success },
  playing_today: { label: 'Gram dzisiaj', color: '#1f6bff', dot: '#1f6bff' },
};
