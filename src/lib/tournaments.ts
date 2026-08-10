import { supabase } from '@/lib/supabase';

export type TournamentSport = 'basketball' | 'football' | 'volleyball' | 'handball';

export const TOURNAMENT_STATUSES = [
  'draft',
  'registration_open',
  'registration_closed',
  'ready',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_STATUS_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['registration_open', 'cancelled'],
  registration_open: ['registration_closed', 'cancelled'],
  registration_closed: ['ready', 'registration_open', 'cancelled'],
  ready: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export type TournamentGroup = {
  id: string;
  name: string;
  sort_order: number;
};

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  sport: TournamentSport;
  event_date: string;
  start_time: string;
  end_time: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string;
  location_name: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  contact_info: string | null;
  max_teams: number;
  min_teams: number;
  players_per_team: number;
  substitutes_per_team: number;
  requires_approval: boolean;
  points_win: number;
  points_draw: number;
  points_loss: number;
  allow_draws: boolean;
  status: TournamentStatus;
  champion_team_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  groups: TournamentGroup[];
};

export type TournamentListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  sport: TournamentSport;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  city: string | null;
  status: TournamentStatus;
  max_teams: number;
  min_teams: number;
  created_at: string;
};

export type NewTournament = {
  name: string;
  description: string | null;
  logoUrl: string | null;
  sport: TournamentSport;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string;
  locationName: string | null;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  contactInfo: string | null;
  maxTeams: number;
  minTeams: number;
  playersPerTeam: number;
  substitutesPerTeam: number;
  requiresApproval: boolean;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  allowDraws: boolean;
  groupNames: string[];
};

export type TournamentUpdate = NewTournament;

export type CreateTournamentResult =
  | { status: 'ok'; tournamentId: string }
  | { status: 'invalid_input' | 'not_admin' | 'error'; tournamentId: null };

export type UpdateTournamentResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_input'
  | 'locked'
  | 'error';

export type SetTournamentStatusResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_transition'
  | 'error';

function parseSport(raw: unknown): TournamentSport {
  return raw === 'football' || raw === 'volleyball' || raw === 'handball' ? raw : 'basketball';
}

function parseStatus(raw: unknown): TournamentStatus {
  return (TOURNAMENT_STATUSES as readonly string[]).includes(raw as string)
    ? (raw as TournamentStatus)
    : 'draft';
}

function mapGroup(raw: Record<string, unknown>): TournamentGroup {
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    sort_order: Number(raw.sort_order) || 0,
  };
}

function mapTournamentDetailRow(raw: Record<string, unknown>): Tournament {
  const rawGroups = Array.isArray(raw.groups) ? raw.groups : [];
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : null,
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : null,
    sport: parseSport(raw.sport),
    event_date: String(raw.event_date ?? ''),
    start_time: String(raw.start_time ?? ''),
    end_time: typeof raw.end_time === 'string' ? raw.end_time : null,
    registration_opens_at:
      typeof raw.registration_opens_at === 'string' ? raw.registration_opens_at : null,
    registration_closes_at: String(raw.registration_closes_at ?? ''),
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    address: typeof raw.address === 'string' ? raw.address : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : null,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : null,
    contact_info: typeof raw.contact_info === 'string' ? raw.contact_info : null,
    max_teams: Number(raw.max_teams) || 0,
    min_teams: Number(raw.min_teams) || 0,
    players_per_team: Number(raw.players_per_team) || 0,
    substitutes_per_team: Number(raw.substitutes_per_team) || 0,
    requires_approval: Boolean(raw.requires_approval),
    points_win: Number(raw.points_win) || 0,
    points_draw: Number(raw.points_draw) || 0,
    points_loss: Number(raw.points_loss) || 0,
    allow_draws: Boolean(raw.allow_draws),
    status: parseStatus(raw.status),
    champion_team_id: typeof raw.champion_team_id === 'string' ? raw.champion_team_id : null,
    created_by: String(raw.created_by ?? ''),
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? ''),
    groups: rawGroups.map((g) => mapGroup(g as Record<string, unknown>)),
  };
}

function mapTournamentListRow(raw: Record<string, unknown>): TournamentListItem {
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : null,
    sport: parseSport(raw.sport),
    event_date: String(raw.event_date ?? ''),
    start_time: String(raw.start_time ?? ''),
    end_time: typeof raw.end_time === 'string' ? raw.end_time : null,
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    status: parseStatus(raw.status),
    max_teams: Number(raw.max_teams) || 0,
    min_teams: Number(raw.min_teams) || 0,
    created_at: String(raw.created_at ?? ''),
  };
}

function toRpcPayload(input: NewTournament) {
  return {
    p_name: input.name,
    p_description: input.description,
    p_logo_url: input.logoUrl,
    p_sport: input.sport,
    p_event_date: input.eventDate,
    p_start_time: input.startTime,
    p_end_time: input.endTime,
    p_registration_opens_at: input.registrationOpensAt,
    p_registration_closes_at: input.registrationClosesAt,
    p_location_name: input.locationName,
    p_address: input.address,
    p_city: input.city,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_contact_info: input.contactInfo,
    p_max_teams: input.maxTeams,
    p_min_teams: input.minTeams,
    p_players_per_team: input.playersPerTeam,
    p_substitutes_per_team: input.substitutesPerTeam,
    p_requires_approval: input.requiresApproval,
    p_points_win: input.pointsWin,
    p_points_draw: input.pointsDraw,
    p_points_loss: input.pointsLoss,
    p_allow_draws: input.allowDraws,
    p_group_names: input.groupNames,
  };
}

export async function createTournament(input: NewTournament): Promise<CreateTournamentResult> {
  const { data, error } = await supabase.rpc('admin_create_tournament', toRpcPayload(input));
  if (error) return { status: 'error', tournamentId: null };

  const row = (data as Record<string, unknown>[] | null)?.[0];
  const status = row?.status as CreateTournamentResult['status'] | undefined;
  if (status === 'ok' && typeof row?.tournament_id === 'string') {
    return { status: 'ok', tournamentId: row.tournament_id };
  }
  return { status: (status as Exclude<CreateTournamentResult['status'], 'ok'> | undefined) ?? 'error', tournamentId: null };
}

export async function updateTournament(
  tournamentId: string,
  input: TournamentUpdate,
): Promise<UpdateTournamentResult> {
  const { data, error } = await supabase.rpc('admin_update_tournament', {
    p_tournament_id: tournamentId,
    ...toRpcPayload(input),
  });
  if (error) return 'error';
  return (data as UpdateTournamentResult | null) ?? 'error';
}

export async function setTournamentStatus(
  tournamentId: string,
  newStatus: TournamentStatus,
): Promise<SetTournamentStatusResult> {
  const { data, error } = await supabase.rpc('admin_set_tournament_status', {
    p_tournament_id: tournamentId,
    p_new_status: newStatus,
  });
  if (error) return 'error';
  return (data as SetTournamentStatusResult | null) ?? 'error';
}

export async function getTournamentDetail(
  tournamentId: string,
): Promise<{ data: Tournament | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('get_tournament_detail', {
    p_tournament_id: tournamentId,
  });
  if (error) return { data: null, error };

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  if (rows.length === 0) return { data: null, error: null };
  return { data: mapTournamentDetailRow(rows[0]), error: null };
}

export async function listTournaments(
  statusFilter: TournamentStatus | null,
  adminView: boolean,
  limit = 50,
  offset = 0,
): Promise<{ data: TournamentListItem[]; totalCount: number; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_tournaments', {
    p_status_filter: statusFilter,
    p_admin_view: adminView,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) return { data: [], totalCount: 0, error };

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  return { data: rows.map(mapTournamentListRow), totalCount, error: null };
}
