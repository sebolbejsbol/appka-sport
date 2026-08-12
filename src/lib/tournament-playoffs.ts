import { supabase } from '@/lib/supabase';

export type TournamentPlayoffStatus = 'pending' | 'scheduled' | 'completed';

export type TournamentPlayoffMatch = {
  id: string;
  round: number;
  slot: number;
  team_a_id: string | null;
  team_a_name: string | null;
  team_b_id: string | null;
  team_b_name: string | null;
  score_a: number | null;
  score_b: number | null;
  winner_team_id: string | null;
  status: TournamentPlayoffStatus;
};

export type AdminGenerateBracketResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_status'
  | 'bracket_exists'
  | 'group_stage_incomplete'
  | 'invalid_input'
  | 'not_enough_qualified_teams'
  | 'error';

export type AdminRecordPlayoffResultResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'not_scheduled'
  | 'invalid_input'
  | 'draws_not_allowed'
  | 'error';

function parsePlayoffStatus(raw: unknown): TournamentPlayoffStatus {
  return raw === 'scheduled' || raw === 'completed' ? raw : 'pending';
}

function mapPlayoffRow(raw: Record<string, unknown>): TournamentPlayoffMatch {
  return {
    id: String(raw.id ?? ''),
    round: typeof raw.round === 'number' ? raw.round : 0,
    slot: typeof raw.slot === 'number' ? raw.slot : 0,
    team_a_id: typeof raw.team_a_id === 'string' ? raw.team_a_id : null,
    team_a_name: typeof raw.team_a_name === 'string' ? raw.team_a_name : null,
    team_b_id: typeof raw.team_b_id === 'string' ? raw.team_b_id : null,
    team_b_name: typeof raw.team_b_name === 'string' ? raw.team_b_name : null,
    score_a: typeof raw.score_a === 'number' ? raw.score_a : null,
    score_b: typeof raw.score_b === 'number' ? raw.score_b : null,
    winner_team_id: typeof raw.winner_team_id === 'string' ? raw.winner_team_id : null,
    status: parsePlayoffStatus(raw.status),
  };
}

export async function listTournamentPlayoffBracket(
  tournamentId: string,
): Promise<{ data: TournamentPlayoffMatch[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_tournament_playoff_bracket', {
    p_tournament_id: tournamentId,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapPlayoffRow),
    error: null,
  };
}

export async function adminGenerateBracket(
  tournamentId: string,
  teamsPerGroup: number,
): Promise<AdminGenerateBracketResult> {
  const { data, error } = await supabase.rpc('admin_generate_bracket', {
    p_tournament_id: tournamentId,
    p_teams_per_group: teamsPerGroup,
  });
  if (error) return 'error';
  return (data as AdminGenerateBracketResult | null) ?? 'error';
}

export async function adminRecordPlayoffResult(
  matchId: string,
  scoreA: number,
  scoreB: number,
): Promise<AdminRecordPlayoffResultResult> {
  const { data, error } = await supabase.rpc('admin_record_playoff_result', {
    p_match_id: matchId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });
  if (error) return 'error';
  return (data as AdminRecordPlayoffResultResult | null) ?? 'error';
}
