-- Migracja 0086 (Faza 7 turniejów): realny licznik zaakceptowanych drużyn
-- w list_tournaments (naprawa zahardkodowanego "0" na karcie turnieju),
-- admin_delete_tournament (trwałe usunięcie, wcześniej było tylko "anuluj"),
-- oraz wymuszenie players_per_team przy rejestracji/akceptacji drużyny
-- (wcześniej rozmiar drużyny nie był w ogóle sprawdzany).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) list_tournaments: dodajemy approved_teams_count (zmiana kształtu
--    zwracanej tabeli -> wymaga drop+create, nie create or replace).
drop function if exists public.list_tournaments(text, boolean, integer, integer);

create function public.list_tournaments(
  p_status_filter text default null,
  p_admin_view boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, name text, logo_url text, sport text,
  event_date date, start_time time, end_time time,
  location_name text, city text,
  latitude double precision, longitude double precision,
  status text, max_teams integer, min_teams integer, created_at timestamptz,
  approved_teams_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_admin_view and not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    t.id, t.name, t.logo_url, t.sport,
    t.event_date, t.start_time, t.end_time,
    t.location_name, t.city,
    t.latitude, t.longitude,
    t.status, t.max_teams, t.min_teams, t.created_at,
    (
      select count(*)::integer from public.tournament_teams tt
      where tt.tournament_id = t.id and tt.status = 'approved'
    ) as approved_teams_count,
    count(*) over() as total_count
  from public.tournaments t
  where
    (p_admin_view or t.status not in ('draft', 'cancelled'))
    and (p_status_filter is null or t.status = p_status_filter)
  order by t.event_date desc, t.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_tournaments(text, boolean, integer, integer) from public;
grant execute on function public.list_tournaments(text, boolean, integer, integer) to authenticated;

-- 2) Admin: trwałe usunięcie turnieju. Ograniczone do draft/cancelled —
--    turniej z realnymi meczami/wynikami trzeba najpierw anulować, dopiero
--    potem można usunąć (ten sam duch co "cancelled to już stan końcowy").
--    Dzieci (tournament_teams/tournament_groups/tournament_matches/
--    tournament_playoff_matches) mają "on delete cascade" od migracji
--    0073/0074/0075, więc kasują się same.
create or replace function public.admin_delete_tournament(p_tournament_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_name text;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select status, name into v_status, v_name
    from public.tournaments where id = p_tournament_id;
  if not found then return 'not_found'; end if;

  if v_status not in ('draft', 'cancelled') then return 'locked'; end if;

  -- Log przed usunięciem — po delete wiersz (i jego entity_id) już nie istnieje.
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'delete_tournament', 'tournament', p_tournament_id,
    jsonb_build_object('name', v_name, 'status', v_status));

  delete from public.tournaments where id = p_tournament_id;

  return 'ok';
end;
$$;

revoke all on function public.admin_delete_tournament(uuid) from public;
grant execute on function public.admin_delete_tournament(uuid) to authenticated;

-- 3) register_team_for_tournament: dopięcie kontroli players_per_team —
--    wcześniej dowolna drużyna (choćby 1-osobowa) mogła się zarejestrować.
create or replace function public.register_team_for_tournament(
  p_tournament_id uuid, p_team_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_t_status text; v_t_sport text; v_max_teams integer; v_requires_approval boolean;
  v_players_per_team integer;
  v_team_sport text;
  v_member_count integer;
  v_existing_status text;
  v_approved_count integer;
  v_new_status text;
begin
  if v_actor is null then return 'not_team_manager'; end if;
  if not public.is_team_manager(p_team_id, v_actor) then return 'not_team_manager'; end if;

  select status, sport, max_teams, requires_approval, players_per_team
    into v_t_status, v_t_sport, v_max_teams, v_requires_approval, v_players_per_team
    from public.tournaments where id = p_tournament_id for update;
  if not found then return 'tournament_not_found'; end if;

  select sport into v_team_sport from public.teams where id = p_team_id;
  if not found then return 'team_not_found'; end if;

  if v_t_status <> 'registration_open' then return 'not_open'; end if;
  if v_team_sport <> v_t_sport then return 'wrong_sport'; end if;

  select count(*) into v_member_count
    from public.team_members where team_id = p_team_id;
  if v_member_count < v_players_per_team then return 'team_too_small'; end if;

  select status into v_existing_status
    from public.tournament_teams
    where tournament_id = p_tournament_id and team_id = p_team_id;
  if v_existing_status in ('pending', 'approved') then return 'already_registered'; end if;

  select count(*) into v_approved_count
    from public.tournament_teams
    where tournament_id = p_tournament_id and status = 'approved';
  if v_approved_count >= v_max_teams then return 'tournament_full'; end if;

  v_new_status := case when v_requires_approval then 'pending' else 'approved' end;

  insert into public.tournament_teams (tournament_id, team_id, status, requested_by)
  values (p_tournament_id, p_team_id, v_new_status, v_actor)
  on conflict (tournament_id, team_id) do update set
    status = v_new_status,
    requested_by = excluded.requested_by,
    created_at = now(),
    responded_at = null,
    responded_by = null,
    group_id = null;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'register_team', 'tournament_team', p_tournament_id,
    jsonb_build_object('team_id', p_team_id, 'status', v_new_status));

  return 'ok';
end;
$$;

revoke all on function public.register_team_for_tournament(uuid, uuid) from public;
grant execute on function public.register_team_for_tournament(uuid, uuid) to authenticated;

-- 4) admin_respond_team_registration: re-sprawdzenie players_per_team przy
--    akceptacji — skład drużyny mógł się zmienić (manager usunął kogoś)
--    między zgłoszeniem a decyzją admina. Odrzucenie zawsze dozwolone
--    niezależnie od rozmiaru.
create or replace function public.admin_respond_team_registration(
  p_registration_id uuid, p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text; v_tournament_id uuid; v_team_id uuid;
  v_max_teams integer; v_players_per_team integer;
  v_approved_count integer; v_member_count integer;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select status, tournament_id, team_id into v_status, v_tournament_id, v_team_id
    from public.tournament_teams where id = p_registration_id;
  if not found then return 'not_found'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  if p_accept then
    select max_teams, players_per_team into v_max_teams, v_players_per_team
      from public.tournaments where id = v_tournament_id for update;
    select count(*) into v_approved_count
      from public.tournament_teams
      where tournament_id = v_tournament_id and status = 'approved';
    if v_approved_count >= v_max_teams then return 'tournament_full'; end if;

    select count(*) into v_member_count
      from public.team_members where team_id = v_team_id;
    if v_member_count < v_players_per_team then return 'team_too_small'; end if;

    update public.tournament_teams
      set status = 'approved', responded_at = now(), responded_by = v_actor
      where id = p_registration_id;

    insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_actor, 'approve_team_registration', 'tournament_team', p_registration_id, '{}'::jsonb);
  else
    update public.tournament_teams
      set status = 'rejected', responded_at = now(), responded_by = v_actor
      where id = p_registration_id;

    insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
    values (v_actor, 'reject_team_registration', 'tournament_team', p_registration_id, '{}'::jsonb);
  end if;

  return 'ok';
end;
$$;

revoke all on function public.admin_respond_team_registration(uuid, boolean) from public;
grant execute on function public.admin_respond_team_registration(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
