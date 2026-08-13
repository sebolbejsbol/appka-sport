-- Migracja 0087: automatyczne segregowanie drużyn po zamknięciu zapisów.
-- Zamiast ręcznego wpisywania nazw grup przy tworzeniu turnieju i ręcznego
-- przypisywania każdej drużyny do grupy po jednej, admin klika jeden
-- przycisk po zamknięciu zapisów — system sam decyduje o kształcie
-- (>8 zaakceptowanych drużyn -> grupy po maks. 8, top 2 z grupy awansuje;
-- <=8 -> od razu drabinka pucharowa bez fazy grupowej) i buduje cały
-- terminarz.
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia) poza samym
-- admin_auto_organize_tournament, który celowo odmawia powtórnego
-- zorganizowania tego samego turnieju (patrz 'already_organized').

-- 1) admin_create_tournament: usunięcie p_group_names — grupy nie są już
--    tworzone przy zakładaniu turnieju, tylko przez segregator poniżej.
--    Zmiana listy parametrów wymaga drop + create (nie create or replace).
drop function if exists public.admin_create_tournament(
  text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
);

create function public.admin_create_tournament(
  p_name text, p_description text, p_logo_url text, p_sport text,
  p_event_date date, p_start_time time, p_end_time time,
  p_registration_opens_at timestamptz, p_registration_closes_at timestamptz,
  p_location_name text, p_address text, p_city text,
  p_latitude double precision, p_longitude double precision, p_contact_info text,
  p_max_teams integer, p_min_teams integer, p_players_per_team integer,
  p_substitutes_per_team integer, p_requires_approval boolean,
  p_points_win integer, p_points_draw integer, p_points_loss integer,
  p_allow_draws boolean
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

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'create_tournament', 'tournament', v_id, jsonb_build_object('name', v_name));

  return query select 'ok'::text, v_id;
end;
$$;

revoke all on function public.admin_create_tournament(
  text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean
) from public;
grant execute on function public.admin_create_tournament(
  text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean
) to authenticated;

-- 2) admin_update_tournament: sama zmiana — usunięcie p_group_names, koniec
--    z delete+reinsert tournament_groups przy edycji. Bezpieczne: ta funkcja
--    i tak odmawia działania poza statusem draft/registration_open, więc
--    nigdy nie mogła być wywołana po tym jak segregator już utworzył grupy.
drop function if exists public.admin_update_tournament(
  uuid, text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean, text[]
);

create function public.admin_update_tournament(
  p_tournament_id uuid,
  p_name text, p_description text, p_logo_url text, p_sport text,
  p_event_date date, p_start_time time, p_end_time time,
  p_registration_opens_at timestamptz, p_registration_closes_at timestamptz,
  p_location_name text, p_address text, p_city text,
  p_latitude double precision, p_longitude double precision, p_contact_info text,
  p_max_teams integer, p_min_teams integer, p_players_per_team integer,
  p_substitutes_per_team integer, p_requires_approval boolean,
  p_points_win integer, p_points_draw integer, p_points_loss integer,
  p_allow_draws boolean
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

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'update_tournament', 'tournament', p_tournament_id, jsonb_build_object('name', v_name));

  return 'ok';
end;
$$;

revoke all on function public.admin_update_tournament(
  uuid, text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean
) from public;
grant execute on function public.admin_update_tournament(
  uuid, text, text, text, text, date, time, time, timestamptz, timestamptz, text, text, text,
  double precision, double precision, text, integer, integer, integer, integer, boolean,
  integer, integer, integer, boolean
) to authenticated;

-- 3) admin_generate_bracket_direct: ta sama matematyka seedowania/wolnych
--    losów co admin_generate_bracket (0075), ale bez fazy grupowej — seed
--    idzie bezpośrednio z zaakceptowanych tournament_teams (losowa
--    kolejność), nie z get_tournament_standings. Osobna, samodzielna
--    funkcja (nie refaktor admin_generate_bracket) — zero ryzyka regresji
--    dla już przetestowanej Fazy 5.
create or replace function public.admin_generate_bracket_direct(p_tournament_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_t_status text;
  v_seed_teams uuid[];
  v_n integer;
  v_bracket_size integer;
  v_total_rounds integer;
  v_i integer;
  v_low_seed integer;
  v_high_seed integer;
  v_team_a uuid;
  v_slots_in_round integer;
  v_j integer;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select t.status into v_t_status from public.tournaments t where t.id = p_tournament_id;
  if not found then return 'not_found'; end if;
  if v_t_status <> 'in_progress' then return 'invalid_status'; end if;

  if exists (
    select 1 from public.tournament_playoff_matches m where m.tournament_id = p_tournament_id
  ) then
    return 'bracket_exists';
  end if;

  select coalesce(array_agg(tt.team_id order by random()), array[]::uuid[])
    into v_seed_teams
    from public.tournament_teams tt
    where tt.tournament_id = p_tournament_id and tt.status = 'approved';

  v_n := coalesce(array_length(v_seed_teams, 1), 0);
  if v_n < 2 then return 'not_enough_qualified_teams'; end if;

  v_bracket_size := 1;
  while v_bracket_size < v_n loop
    v_bracket_size := v_bracket_size * 2;
  end loop;

  v_total_rounds := 0;
  v_i := v_bracket_size;
  while v_i > 1 loop
    v_i := v_i / 2;
    v_total_rounds := v_total_rounds + 1;
  end loop;

  -- Runda 1: seed i kontra seed (bracket_size + 1 - i); brak przeciwnika ->
  -- wolny los, drużyna awansuje od razu (identyczna logika co 0075).
  for v_i in 1 .. (v_bracket_size / 2) loop
    v_low_seed := v_i;
    v_high_seed := v_bracket_size + 1 - v_i;
    v_team_a := v_seed_teams[v_low_seed];
    if v_high_seed <= v_n then
      insert into public.tournament_playoff_matches
        (tournament_id, round, slot, team_a_id, team_b_id, status)
      values
        (p_tournament_id, 1, v_i, v_team_a, v_seed_teams[v_high_seed], 'scheduled');
    else
      insert into public.tournament_playoff_matches
        (tournament_id, round, slot, team_a_id, team_b_id, winner_team_id, status, completed_at)
      values
        (p_tournament_id, 1, v_i, v_team_a, null, v_team_a, 'completed', now());
    end if;
  end loop;

  v_slots_in_round := v_bracket_size / 2;
  for v_j in 2 .. v_total_rounds loop
    v_slots_in_round := v_slots_in_round / 2;
    for v_i in 1 .. v_slots_in_round loop
      insert into public.tournament_playoff_matches (tournament_id, round, slot, status)
      values (p_tournament_id, v_j, v_i, 'pending');
    end loop;
  end loop;

  -- Dwa oddzielne UPDATE-y (patrz komentarz w 0075) — nie jeden UPDATE...FROM.
  update public.tournament_playoff_matches r2
    set team_a_id = r1.winner_team_id
    from public.tournament_playoff_matches r1
    where r1.tournament_id = p_tournament_id and r1.round = 1 and r1.status = 'completed'
      and r1.slot % 2 = 1
      and r2.tournament_id = p_tournament_id and r2.round = 2
      and r2.slot = ceil(r1.slot / 2.0);

  update public.tournament_playoff_matches r2
    set team_b_id = r1.winner_team_id
    from public.tournament_playoff_matches r1
    where r1.tournament_id = p_tournament_id and r1.round = 1 and r1.status = 'completed'
      and r1.slot % 2 = 0
      and r2.tournament_id = p_tournament_id and r2.round = 2
      and r2.slot = ceil(r1.slot / 2.0);

  update public.tournament_playoff_matches
    set status = 'scheduled'
    where tournament_id = p_tournament_id and round = 2 and status = 'pending'
      and team_a_id is not null and team_b_id is not null;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'generate_bracket_direct', 'tournament', p_tournament_id,
    jsonb_build_object('qualified_count', v_n, 'rounds', v_total_rounds));

  return 'ok';
end;
$$;

revoke all on function public.admin_generate_bracket_direct(uuid) from public;
grant execute on function public.admin_generate_bracket_direct(uuid) to authenticated;

-- 4) admin_auto_organize_tournament: jeden przycisk po zamknięciu zapisów.
--    <=8 zaakceptowanych drużyn -> od razu drabinka (admin_generate_bracket_direct).
--    >8 -> tyle grup po maks. 8 ile trzeba, losowy rozdział drużyn, potem
--    zwykłe przejście na 'ready' (które i tak już generuje terminarz "każdy
--    z każdym" dla przypisanych drużyn — 0074:363-365).
create or replace function public.admin_auto_organize_tournament(p_tournament_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_min_teams integer;
  v_approved_count integer;
  v_num_groups integer;
  v_group_ids uuid[];
  v_result text;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select status, min_teams into v_status, v_min_teams
    from public.tournaments where id = p_tournament_id;
  if not found then return 'not_found'; end if;
  -- Nie trzeba osobnej ochrony przed podwójnym uruchomieniem: udana segregacja
  -- zawsze przestawia status na 'ready' albo 'in_progress', więc kolejne
  -- wywołanie i tak odbije się o poniższy warunek jako invalid_status.
  if v_status <> 'registration_closed' then return 'invalid_status'; end if;

  select count(*) into v_approved_count
    from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'approved';

  if v_approved_count < v_min_teams then
    return 'not_enough_teams';
  end if;

  if v_approved_count <= 8 then
    select public.admin_set_tournament_status(p_tournament_id, 'ready') into v_result;
    if v_result <> 'ok' then return v_result; end if;

    select public.admin_set_tournament_status(p_tournament_id, 'in_progress') into v_result;
    if v_result <> 'ok' then return v_result; end if;

    select public.admin_generate_bracket_direct(p_tournament_id) into v_result;
    if v_result <> 'ok' then return v_result; end if;

    insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_actor, 'auto_organize_tournament', 'tournament', p_tournament_id,
      jsonb_build_object('mode', 'direct_bracket', 'teams', v_approved_count));

    return 'ok';
  end if;

  v_num_groups := ceil(v_approved_count / 8.0)::integer;

  with inserted as (
    insert into public.tournament_groups (tournament_id, name, sort_order)
    select p_tournament_id, 'Grupa ' || chr(64 + gs), gs - 1
    from generate_series(1, v_num_groups) as gs
    returning id, sort_order
  )
  select array_agg(id order by sort_order) into v_group_ids from inserted;

  with shuffled as (
    select tt.id, row_number() over (order by random()) - 1 as rn
    from public.tournament_teams tt
    where tt.tournament_id = p_tournament_id and tt.status = 'approved'
  )
  update public.tournament_teams tt
    set group_id = v_group_ids[(s.rn % v_num_groups) + 1]
    from shuffled s
    where tt.id = s.id;

  select public.admin_set_tournament_status(p_tournament_id, 'ready') into v_result;
  if v_result <> 'ok' then return v_result; end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'auto_organize_tournament', 'tournament', p_tournament_id,
    jsonb_build_object('mode', 'groups', 'groups', v_num_groups, 'teams', v_approved_count));

  return 'ok';
end;
$$;

revoke all on function public.admin_auto_organize_tournament(uuid) from public;
grant execute on function public.admin_auto_organize_tournament(uuid) to authenticated;

notify pgrst, 'reload schema';
