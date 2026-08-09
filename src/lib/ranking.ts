import { t, type TKey } from '@/i18n';
import { supabase } from '@/lib/supabase';

export type Division = {
  id: string;
  /** Klucz i18n nazwy rangi — tłumaczone dopiero przy odczycie (patrz `divisionName`). */
  nameKey: TKey;
  emoji: string;
  /** Kolor wiodący rangi (badge, akcenty). */
  color: string;
  /** Jaśniejsze tło pod badge. */
  tint: string;
  /** Próg XP wejścia do rangi. */
  minXp: number;
};

/** Rangi od najniższej do najwyższej (10 poziomów, rosnące progi XP). */
export const DIVISIONS: Division[] = [
  { id: 'rookie', nameKey: 'ranking.divisionRookie', emoji: '🐣', color: '#a16207', tint: '#fef9c3', minXp: 0 },
  { id: 'amateur', nameKey: 'ranking.divisionAmateur', emoji: '🏃', color: '#65a30d', tint: '#f7fee7', minXp: 200 },
  { id: 'player', nameKey: 'ranking.divisionPlayer', emoji: '🔥', color: '#0d9488', tint: '#f0fdfa', minXp: 500 },
  { id: 'pro', nameKey: 'ranking.divisionPro', emoji: '⚡', color: '#0891b2', tint: '#ecfeff', minXp: 1000 },
  { id: 'tough', nameKey: 'ranking.divisionTough', emoji: '🥊', color: '#2563eb', tint: '#eff6ff', minXp: 1800 },
  { id: 'veteran', nameKey: 'ranking.divisionVeteran', emoji: '🏅', color: '#7c3aed', tint: '#f5f3ff', minXp: 3000 },
  { id: 'ace', nameKey: 'ranking.divisionAce', emoji: '🦅', color: '#c026d3', tint: '#fdf4ff', minXp: 5000 },
  { id: 'master', nameKey: 'ranking.divisionMaster', emoji: '👑', color: '#db2777', tint: '#fdf2f8', minXp: 8000 },
  { id: 'titan', nameKey: 'ranking.divisionTitan', emoji: '🐉', color: '#dc2626', tint: '#fef2f2', minXp: 12000 },
  { id: 'legend', nameKey: 'ranking.divisionLegend', emoji: '🌟', color: '#d97706', tint: '#fffbeb', minXp: 18000 },
];

/** Przetłumaczona nazwa rangi w aktualnym języku — wywoływać w renderze, nie raz przy imporcie. */
export function divisionName(division: Division): string {
  return t(division.nameKey);
}

export type DivisionProgress = {
  division: Division;
  next: Division | null;
  /** Postęp 0..1 do następnej rangi (1 dla maksymalnej). */
  progress: number;
  /** XP brakujące do awansu (0 dla maksymalnej). */
  xpToNext: number;
};

export function divisionForXp(xp: number): Division {
  let current = DIVISIONS[0];
  for (const d of DIVISIONS) {
    if (xp >= d.minXp) current = d;
    else break;
  }
  return current;
}

export function divisionProgress(xp: number): DivisionProgress {
  const division = divisionForXp(xp);
  const index = DIVISIONS.findIndex((d) => d.id === division.id);
  const next = index < DIVISIONS.length - 1 ? DIVISIONS[index + 1] : null;
  if (!next) {
    return { division, next: null, progress: 1, xpToNext: 0 };
  }
  const span = next.minXp - division.minXp;
  const gained = xp - division.minXp;
  const progress = span > 0 ? Math.min(1, Math.max(0, gained / span)) : 0;
  return { division, next, progress, xpToNext: Math.max(0, next.minXp - xp) };
}

export type LeaderboardEntry = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  city: string | null;
  country_code: string | null;
  events_played: number;
  events_created: number;
  check_ins: number;
  xp: number;
  rank: number;
};

export type PlayerRank = {
  user_id: string;
  xp: number;
  rank: number;
  total: number;
  events_played: number;
  events_created: number;
  check_ins: number;
};

function n(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

export async function getLeaderboard(
  limit = 100,
): Promise<{ data: LeaderboardEntry[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: limit });
  if (error) return { data: [], error };
  const rows = (data as Record<string, unknown>[] | null) ?? [];
  return {
    data: rows.map((r) => ({
      user_id: String(r.user_id ?? ''),
      nick: typeof r.nick === 'string' ? r.nick : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      city: typeof r.city === 'string' ? r.city : null,
      country_code: typeof r.country_code === 'string' ? r.country_code : null,
      events_played: n(r.events_played),
      events_created: n(r.events_created),
      check_ins: n(r.check_ins),
      xp: n(r.xp),
      rank: n(r.rank),
    })),
    error: null,
  };
}

export async function getPlayerRank(
  userId: string,
): Promise<{ data: PlayerRank | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_player_rank', { p_user: userId });
  if (error) return { data: null, error };
  const row = ((data as Record<string, unknown>[] | null) ?? [])[0];
  if (!row) return { data: null, error: null };
  return {
    data: {
      user_id: String(row.user_id ?? userId),
      xp: n(row.xp),
      rank: n(row.rank),
      total: n(row.total),
      events_played: n(row.events_played),
      events_created: n(row.events_created),
      check_ins: n(row.check_ins),
    },
    error: null,
  };
}
