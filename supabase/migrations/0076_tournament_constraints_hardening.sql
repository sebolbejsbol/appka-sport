-- Migracja 0076: domknięcie 2 luk odnotowanych w finalnym review Fazy 2
-- (odłożonych jako "Minor, nieblokujące"): brakujący FK na
-- tournaments.champion_team_id oraz brak walidacji nieujemności
-- points_win/points_draw/points_loss (ani na poziomie bazy, ani w RPC).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) FK: champion_team_id musi wskazywać na istniejącą drużynę (albo być null).
--    on delete set null — usunięcie drużyny nie usuwa historycznego turnieju.
alter table public.tournaments drop constraint if exists tournaments_champion_team_id_fkey;
alter table public.tournaments
  add constraint tournaments_champion_team_id_fkey
  foreign key (champion_team_id) references public.teams (id) on delete set null;

-- 2) Nieujemność punktacji (obrona w głąb — patrz też walidacja RPC poniżej).
alter table public.tournaments drop constraint if exists tournaments_points_nonneg;
alter table public.tournaments
  add constraint tournaments_points_nonneg
  check (points_win >= 0 and points_draw >= 0 and points_loss >= 0);

-- 3) admin_create_tournament: dopisana walidacja punktacji (create or replace,
--    ta sama sygnatura, bez zmiany kształtu kolumn).
create or replace function public.admin_create_tournament(
  p_name text, p_description text, p_logo_url text, p_sport text,
  p_event_date date, p_start_time time, p_end_time time,
  p_registration_opens_at timestamptz, p_registration_closes_at timestamptz,
  p_location_name text, p_address text, p_city text,
  p_latitude double precision, p_longitude double precision, p_contact_info text,
  p_max_teams integer, p_min_teams integer, p_players_per_team integer,
  p_substitutes_per_team integer, p_requires_approval boolean,
  p_points_win integer, p_points_draw integer, p_points_loss integer,
  p_allow_draws boolean, p_group_names text[]
)
returns table (status text, tournament_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_group_count integer := coalesce(array_length(p_group_names, 1), 0);
  v_group text;
begin
  if v_actor is null or not public.is_app_admin() then
    return query select 'not_admin'::text, null::uuid; return;
  end if;

  if char_length(v_name) < 3 or char_length(v_name) > 100 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_sport not in ('basketball', 'football', 'volleyball', 'handball') then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_max_teams is null or p_max_teams < 2 or p_max_teams > 128 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_min_teams is null or p_min_teams < 2 or p_min_teams > p_max_teams then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_players_per_team is null or p_players_per_team < 1 or p_players_per_team > 30 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_substitutes_per_team is null or p_substitutes_per_team < 0 or p_substitutes_per_team > 15 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_registration_closes_at is null then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if p_registration_opens_at is not null and p_registration_opens_at >= p_registration_closes_at then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if coalesce(p_points_win, 3) < 0 or coalesce(p_points_draw, 1) < 0 or coalesce(p_points_loss, 0) < 0 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;
  if v_group_count < 1 or v_group_count > 16 then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;

  foreach v_group in array p_group_names loop
    if char_length(trim(coalesce(v_group, ''))) < 1 or char_length(trim(v_group)) > 40 then
      return query select 'invalid_input'::text, null::uuid; return;
    end if;
  end loop;

  if (select count(distinct trim(g)) from unnest(p_group_names) as g) <> v_group_count then
    return query select 'invalid_input'::text, null::uuid; return;
  end if;

  insert into public.tournaments (
    name, description, logo_url, sport, event_date, start_time, end_time,
    registration_opens_at, registration_closes_at, location_name, address, city,
    latitude, longitude, contact_info, max_teams, min_teams, players_per_team,
    substitutes_per_team, requires_approval, points_win, points_draw, points_loss,
    allow_draws, status, created_by
  ) values (
    v_name, nullif(trim(coalesce(p_description, '')), ''), p_logo_url, p_sport,
    p_event_date, p_start_time, p_end_time, p_registration_opens_at,
    p_registration_closes_at, nullif(trim(coalesce(p_location_name, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_city, '')), ''),
    p_latitude, p_longitude, nullif(trim(coalesce(p_contact_info, '')), ''),
    p_max_teams, p_min_teams, p_players_per_team, p_substitutes_per_team,
    coalesce(p_requires_approval, false), coalesce(p_points_win, 3),
    coalesce(p_points_draw, 1), coalesce(p_points_loss, 0),
    coalesce(p_allow_draws, true), 'draft', v_actor
  )
  returning id into v_id;

  insert into public.tournament_groups (tournament_id, name, sort_order)
  select v_id, trim(g), (ord - 1)
  from unnest(p_group_names) with ordinality as t(g, ord);

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'create_tournament', 'tournament', v_id, jsonb_build_object('name', v_name));

  return query select 'ok'::text, v_id;
end;
$$;

revoke all on function public.admin_create_tournament(
  text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
) from public;
grant execute on function public.admin_create_tournament(
  text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
) to authenticated;

-- 4) admin_update_tournament: sama walidacja punktacji dopisana analogicznie.
create or replace function public.admin_update_tournament(
  p_tournament_id uuid,
  p_name text, p_description text, p_logo_url text, p_sport text,
  p_event_date date, p_start_time time, p_end_time time,
  p_registration_opens_at timestamptz, p_registration_closes_at timestamptz,
  p_location_name text, p_address text, p_city text,
  p_latitude double precision, p_longitude double precision, p_contact_info text,
  p_max_teams integer, p_min_teams integer, p_players_per_team integer,
  p_substitutes_per_team integer, p_requires_approval boolean,
  p_points_win integer, p_points_draw integer, p_points_loss integer,
  p_allow_draws boolean, p_group_names text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_name text := trim(coalesce(p_name, ''));
  v_group_count integer := coalesce(array_length(p_group_names, 1), 0);
  v_group text;
begin
  if v_actor is null or not public.is_app_admin() then
    return 'not_admin';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  if not found then return 'not_found'; end if;
  if v_status not in ('draft', 'registration_open') then return 'locked'; end if;

  if char_length(v_name) < 3 or char_length(v_name) > 100 then return 'invalid_input'; end if;
  if p_sport not in ('basketball', 'football', 'volleyball', 'handball') then return 'invalid_input'; end if;
  if p_max_teams is null or p_max_teams < 2 or p_max_teams > 128 then return 'invalid_input'; end if;
  if p_min_teams is null or p_min_teams < 2 or p_min_teams > p_max_teams then return 'invalid_input'; end if;
  if p_players_per_team is null or p_players_per_team < 1 or p_players_per_team > 30 then return 'invalid_input'; end if;
  if p_substitutes_per_team is null or p_substitutes_per_team < 0 or p_substitutes_per_team > 15 then return 'invalid_input'; end if;
  if p_registration_closes_at is null then return 'invalid_input'; end if;
  if p_registration_opens_at is not null and p_registration_opens_at >= p_registration_closes_at then return 'invalid_input'; end if;
  if coalesce(p_points_win, 3) < 0 or coalesce(p_points_draw, 1) < 0 or coalesce(p_points_loss, 0) < 0 then
    return 'invalid_input';
  end if;
  if v_group_count < 1 or v_group_count > 16 then return 'invalid_input'; end if;

  foreach v_group in array p_group_names loop
    if char_length(trim(coalesce(v_group, ''))) < 1 or char_length(trim(v_group)) > 40 then
      return 'invalid_input';
    end if;
  end loop;

  if (select count(distinct trim(g)) from unnest(p_group_names) as g) <> v_group_count then
    return 'invalid_input';
  end if;

  update public.tournaments set
    name = v_name,
    description = nullif(trim(coalesce(p_description, '')), ''),
    logo_url = p_logo_url,
    sport = p_sport,
    event_date = p_event_date,
    start_time = p_start_time,
    end_time = p_end_time,
    registration_opens_at = p_registration_opens_at,
    registration_closes_at = p_registration_closes_at,
    location_name = nullif(trim(coalesce(p_location_name, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''),
    city = nullif(trim(coalesce(p_city, '')), ''),
    latitude = p_latitude,
    longitude = p_longitude,
    contact_info = nullif(trim(coalesce(p_contact_info, '')), ''),
    max_teams = p_max_teams,
    min_teams = p_min_teams,
    players_per_team = p_players_per_team,
    substitutes_per_team = p_substitutes_per_team,
    requires_approval = coalesce(p_requires_approval, false),
    points_win = coalesce(p_points_win, 3),
    points_draw = coalesce(p_points_draw, 1),
    points_loss = coalesce(p_points_loss, 0),
    allow_draws = coalesce(p_allow_draws, true)
  where id = p_tournament_id;

  delete from public.tournament_groups where tournament_id = p_tournament_id;
  insert into public.tournament_groups (tournament_id, name, sort_order)
  select p_tournament_id, trim(g), (ord - 1)
  from unnest(p_group_names) with ordinality as t(g, ord);

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'update_tournament', 'tournament', p_tournament_id, jsonb_build_object('name', v_name));

  return 'ok';
end;
$$;

revoke all on function public.admin_update_tournament(
  uuid, text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
) from public;
grant execute on function public.admin_update_tournament(
  uuid, text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
) to authenticated;

notify pgrst, 'reload schema';
