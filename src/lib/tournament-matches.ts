import { supabase } from '@/lib/supabase';

export type TournamentMatchStatus = 'scheduled' | 'completed';

export type TournamentMatch = {
  id: string;
  group_id: string;
  group_name: string;
  team_a_id: string;
  team_a_name: string;
  team_b_id: string;
  team_b_name: string;
  score_a: number | null;
  score_b: number | null;
  status: TournamentMatchStatus;
  completed_at: string | null;
};

export type TournamentStanding = {
  group_id: string;
  group_name: string;
  team_id: string;
  team_name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  points: number;
  rank: number;
};

export type AdminRecordMatchResultResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_input'
  | 'draws_not_allowed'
  | 'error';

export type AdminResetMatchResult = 'ok' | 'not_admin' | 'not_found' | 'error';

function parseMatchStatus(raw: unknown): TournamentMatchStatus {
  return raw === 'completed' ? 'completed' : 'scheduled';
}

function mapMatchRow(raw: Record<string, unknown>): TournamentMatch {
  return {
    id: String(raw.id ?? ''),
    group_id: String(raw.group_id ?? ''),
    group_name: typeof raw.group_name === 'string' ? raw.group_name : '',
    team_a_id: String(raw.team_a_id ?? ''),
    team_a_name: typeof raw.team_a_name === 'string' ? raw.team_a_name : '',
    team_b_id: String(raw.team_b_id ?? ''),
    team_b_name: typeof raw.team_b_name === 'string' ? raw.team_b_name : '',
    score_a: typeof raw.score_a === 'number' ? raw.score_a : null,
    score_b: typeof raw.score_b === 'number' ? raw.score_b : null,
    status: parseMatchStatus(raw.status),
    completed_at: typeof raw.completed_at === 'string' ? raw.completed_at : null,
  };
}

function mapStandingRow(raw: Record<string, unknown>): TournamentStanding {
  return {
    group_id: String(raw.group_id ?? ''),
    group_name: typeof raw.group_name === 'string' ? raw.group_name : '',
    team_id: String(raw.team_id ?? ''),
    team_name: typeof raw.team_name === 'string' ? raw.team_name : '',
    played: typeof raw.played === 'number' ? raw.played : 0,
    wins: typeof raw.wins === 'number' ? raw.wins : 0,
    draws: typeof raw.draws === 'number' ? raw.draws : 0,
    losses: typeof raw.losses === 'number' ? raw.losses : 0,
    points_for: typeof raw.points_for === 'number' ? raw.points_for : 0,
    points_against: typeof raw.points_against === 'number' ? raw.points_against : 0,
    point_diff: typeof raw.point_diff === 'number' ? raw.point_diff : 0,
    points: typeof raw.points === 'number' ? raw.points : 0,
    rank: typeof raw.rank === 'number' ? raw.rank : 0,
  };
}

export async function listTournamentMatches(
  tournamentId: string,
): Promise<{ data: TournamentMatch[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_tournament_matches', {
    p_tournament_id: tournamentId,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapMatchRow),
    error: null,
  };
}

export async function getTournamentStandings(
  tournamentId: string,
): Promise<{ data: TournamentStanding[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_tournament_standings', {
    p_tournament_id: tournamentId,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapStandingRow),
    error: null,
  };
}

export async function adminRecordMatchResult(
  matchId: string,
  scoreA: number,
  scoreB: number,
): Promise<AdminRecordMatchResultResult> {
  const { data, error } = await supabase.rpc('admin_record_match_result', {
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });
  if (error) return 'error';
  return (data as AdminRecordMatchResultResult | null) ?? 'error';
}

export async function adminResetMatch(matchId: string): Promise<AdminResetMatchResult> {
  const { data, error } = await supabase.rpc('admin_reset_match', {
    p_match_id: matchId,
  });
  if (error) return 'error';
  return (data as AdminResetMatchResult | null) ?? 'error';
}
