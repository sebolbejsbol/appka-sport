import { supabase } from '@/lib/supabase';

export type TournamentTeamStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'none';

export type TournamentTeamRegistration = {
  id: string;
  team_id: string;
  team_name: string;
  team_logo_url: string | null;
  team_sport: string;
  status: Exclude<TournamentTeamStatus, 'none'>;
  group_id: string | null;
  group_name: string | null;
  requested_by: string;
  created_at: string;
  responded_at: string | null;
};

export type RegisterTeamResult =
  | 'ok'
  | 'not_team_manager'
  | 'tournament_not_found'
  | 'team_not_found'
  | 'not_open'
  | 'wrong_sport'
  | 'already_registered'
  | 'tournament_full'
  | 'error';

export type WithdrawTeamResult = 'ok' | 'not_team_manager' | 'not_registered' | 'error';

export type AdminRespondResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'not_pending'
  | 'tournament_full'
  | 'error';

export type AdminRemoveResult = 'ok' | 'not_admin' | 'not_found' | 'error';

export type AdminAssignGroupResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'not_approved'
  | 'invalid_group'
  | 'error';

function parseTeamStatus(raw: unknown): Exclude<TournamentTeamStatus, 'none'> {
  return raw === 'approved' || raw === 'rejected' || raw === 'withdrawn' ? raw : 'pending';
}

function mapRegistrationRow(raw: Record<string, unknown>): TournamentTeamRegistration {
  return {
    id: String(raw.id ?? ''),
    team_id: String(raw.team_id ?? ''),
    team_name: typeof raw.team_name === 'string' ? raw.team_name : '',
    team_logo_url: typeof raw.team_logo_url === 'string' ? raw.team_logo_url : null,
    team_sport: typeof raw.team_sport === 'string' ? raw.team_sport : '',
    status: parseTeamStatus(raw.status),
    group_id: typeof raw.group_id === 'string' ? raw.group_id : null,
    group_name: typeof raw.group_name === 'string' ? raw.group_name : null,
    requested_by: String(raw.requested_by ?? ''),
    created_at: String(raw.created_at ?? ''),
    responded_at: typeof raw.responded_at === 'string' ? raw.responded_at : null,
  };
}

export async function registerTeamForTournament(
  tournamentId: string,
  teamId: string,
): Promise<RegisterTeamResult> {
  const { data, error } = await supabase.rpc('register_team_for_tournament', {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
  });
  if (error) return 'error';
  return (data as RegisterTeamResult | null) ?? 'error';
}

export async function withdrawTeamRegistration(
  tournamentId: string,
  teamId: string,
): Promise<WithdrawTeamResult> {
  const { data, error } = await supabase.rpc('withdraw_team_registration', {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
  });
  if (error) return 'error';
  return (data as WithdrawTeamResult | null) ?? 'error';
}

export async function adminRespondTeamRegistration(
  registrationId: string,
  accept: boolean,
): Promise<AdminRespondResult> {
  const { data, error } = await supabase.rpc('admin_respond_team_registration', {
    p_registration_id: registrationId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as AdminRespondResult | null) ?? 'error';
}

export async function adminRemoveTeamRegistration(
  registrationId: string,
): Promise<AdminRemoveResult> {
  const { data, error } = await supabase.rpc('admin_remove_team_registration', {
    p_registration_id: registrationId,
  });
  if (error) return 'error';
  return (data as AdminRemoveResult | null) ?? 'error';
}

export async function adminAssignTeamGroup(
  registrationId: string,
  groupId: string | null,
): Promise<AdminAssignGroupResult> {
  const { data, error } = await supabase.rpc('admin_assign_team_group', {
    p_registration_id: registrationId,
    p_group_id: groupId,
  });
  if (error) return 'error';
  return (data as AdminAssignGroupResult | null) ?? 'error';
}

export async function listTournamentTeamRegistrations(
  tournamentId: string,
  adminView: boolean,
): Promise<{ data: TournamentTeamRegistration[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_tournament_team_registrations', {
    p_tournament_id: tournamentId,
    p_admin_view: adminView,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapRegistrationRow),
    error: null,
  };
}

export async function getMyTeamRegistrationStatus(
  tournamentId: string,
  teamId: string,
): Promise<TournamentTeamStatus> {
  const { data, error } = await supabase.rpc('get_my_team_registration_status', {
    p_tournament_id: tournamentId,
    p_team_id: teamId,
  });
  if (error) return 'none';
  return (data as TournamentTeamStatus | null) ?? 'none';
}
