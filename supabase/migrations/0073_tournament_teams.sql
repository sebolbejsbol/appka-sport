-- Migracja 0073: rejestracja drużyn na turniej (tournament_teams), RPC
-- zgłoszenia/wycofania/akceptacji/odrzucenia/usunięcia/przypisania do grupy,
-- odczyt listy, oraz dopięcie kontroli min_teams przy przejściu
-- registration_closed -> ready w admin_set_tournament_status.
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Tabela rejestracji drużyn
create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  group_id uuid references public.tournament_groups (id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),

  requested_by uuid not null references auth.users (id) on delete restrict,
  responded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint tournament_teams_unique unique (tournament_id, team_id)
);

create index if not exists tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id);
create index if not exists tournament_teams_team_idx
  on public.tournament_teams (team_id);

-- 2) RLS: defense-in-depth, jak przy tournaments (realna kontrola widoczności
--    jest jawna w RPC poniżej, bo RPC są security definer i omijają RLS).
alter table public.tournament_teams enable row level security;

drop policy if exists "Approved registrations are viewable by authenticated users"
  on public.tournament_teams;
create policy "Approved registrations are viewable by authenticated users"
  on public.tournament_teams for select
  to authenticated
  using (
    status = 'approved'
    or public.is_app_admin()
    or public.is_team_manager(team_id, auth.uid())
  );
-- Celowo brak insert/update/delete policy: wszystkie zapisy idą przez RPC poniżej.

-- 3) Zgłoszenie drużyny do turnieju
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
  v_team_sport text;
  v_existing_status text;
  v_approved_count integer;
  v_new_status text;
begin
  if v_actor is null then return 'not_team_manager'; end if;
  if not public.is_team_manager(p_team_id, v_actor) then return 'not_team_manager'; end if;

  select status, sport, max_teams, requires_approval
    into v_t_status, v_t_sport, v_max_teams, v_requires_approval
    from public.tournaments where id = p_tournament_id for update;
  if not found then return 'tournament_not_found'; end if;

  select sport into v_team_sport from public.teams where id = p_team_id;
  if not found then return 'team_not_found'; end if;

  if v_t_status <> 'registration_open' then return 'not_open'; end if;
  if v_team_sport <> v_t_sport then return 'wrong_sport'; end if;

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

-- 4) Wycofanie zgłoszenia
create or replace function public.withdraw_team_registration(
  p_tournament_id uuid, p_team_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if v_actor is null then return 'not_team_manager'; end if;
  if not public.is_team_manager(p_team_id, v_actor) then return 'not_team_manager'; end if;

  select status into v_status from public.tournament_teams
    where tournament_id = p_tournament_id and team_id = p_team_id;
  if not found or v_status not in ('pending', 'approved') then return 'not_registered'; end if;

  update public.tournament_teams
    set status = 'withdrawn', responded_at = now(), responded_by = v_actor, group_id = null
    where tournament_id = p_tournament_id and team_id = p_team_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'withdraw_team_registration', 'tournament_team', p_tournament_id,
    jsonb_build_object('team_id', p_team_id));

  return 'ok';
end;
$$;

revoke all on function public.withdraw_team_registration(uuid, uuid) from public;
grant execute on function public.withdraw_team_registration(uuid, uuid) to authenticated;

-- 5) Admin: akceptacja/odrzucenie zgłoszenia
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
  v_status text; v_tournament_id uuid; v_max_teams integer; v_approved_count integer;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select status, tournament_id into v_status, v_tournament_id
    from public.tournament_teams where id = p_registration_id;
  if not found then return 'not_found'; end if;
  if v_status <> 'pending' then return 'not_pending'; end if;

  if p_accept then
    select max_teams into v_max_teams from public.tournaments where id = v_tournament_id for update;
    select count(*) into v_approved_count
      from public.tournament_teams
      where tournament_id = v_tournament_id and status = 'approved';
    if v_approved_count >= v_max_teams then return 'tournament_full'; end if;

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

-- 6) Admin: usunięcie już zaakceptowanej drużyny (walkower, dyskwalifikacja)
create or replace function public.admin_remove_team_registration(p_registration_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  if not exists (select 1 from public.tournament_teams where id = p_registration_id) then
    return 'not_found';
  end if;

  update public.tournament_teams
    set status = 'rejected', responded_at = now(), responded_by = v_actor, group_id = null
    where id = p_registration_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'remove_team_registration', 'tournament_team', p_registration_id, '{}'::jsonb);

  return 'ok';
end;
$$;

revoke all on function public.admin_remove_team_registration(uuid) from public;
grant execute on function public.admin_remove_team_registration(uuid) to authenticated;

-- 7) Admin: przypisanie zaakceptowanej drużyny do grupy (lub odpięcie, gdy null)
create or replace function public.admin_assign_team_group(
  p_registration_id uuid, p_group_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text; v_tournament_id uuid; v_group_tournament_id uuid;
begin
  if v_actor is null or not public.is_app_admin() then return 'not_admin'; end if;

  select status, tournament_id into v_status, v_tournament_id
    from public.tournament_teams where id = p_registration_id;
  if not found then return 'not_found'; end if;
  if v_status <> 'approved' then return 'not_approved'; end if;

  if p_group_id is not null then
    select tournament_id into v_group_tournament_id
      from public.tournament_groups where id = p_group_id;
    if v_group_tournament_id is null or v_group_tournament_id <> v_tournament_id then
      return 'invalid_group';
    end if;
  end if;

  update public.tournament_teams set group_id = p_group_id where id = p_registration_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'assign_team_group', 'tournament_team', p_registration_id,
    jsonb_build_object('group_id', p_group_id));

  return 'ok';
end;
$$;

revoke all on function public.admin_assign_team_group(uuid, uuid) from public;
grant execute on function public.admin_assign_team_group(uuid, uuid) to authenticated;

-- 8) Odczyt listy rejestracji (admin_view=true wymaga is_app_admin())
create or replace function public.list_tournament_team_registrations(
  p_tournament_id uuid, p_admin_view boolean default false
)
returns table (
  id uuid, team_id uuid, team_name text, team_logo_url text, team_sport text,
  status text, group_id uuid, group_name text,
  requested_by uuid, created_at timestamptz, responded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_admin_view and not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    tt.id, tt.team_id, t.name, t.logo_url, t.sport,
    tt.status, tt.group_id, g.name,
    tt.requested_by, tt.created_at, tt.responded_at
  from public.tournament_teams tt
  join public.teams t on t.id = tt.team_id
  left join public.tournament_groups g on g.id = tt.group_id
  where tt.tournament_id = p_tournament_id
    and (p_admin_view or tt.status = 'approved')
  order by tt.created_at asc;
end;
$$;

revoke all on function public.list_tournament_team_registrations(uuid, boolean) from public;
grant execute on function public.list_tournament_team_registrations(uuid, boolean) to authenticated;

-- 9) Status rejestracji dla własnej drużyny (dla przycisku "Zarejestruj" na
--    publicznej stronie turnieju)
create or replace function public.get_my_team_registration_status(
  p_tournament_id uuid, p_team_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
begin
  if v_actor is null or not public.is_team_manager(p_team_id, v_actor) then
    return 'none';
  end if;

  select status into v_status from public.tournament_teams
    where tournament_id = p_tournament_id and team_id = p_team_id;

  return coalesce(v_status, 'none');
end;
$$;

revoke all on function public.get_my_team_registration_status(uuid, uuid) from public;
grant execute on function public.get_my_team_registration_status(uuid, uuid) to authenticated;

-- 10) Dopięcie kontroli min_teams przy przejściu registration_closed -> ready
--     (domknięcie luki udokumentowanej w Fazie 2 jako "deferred to Phase 3/4").
--     Ta sama sygnatura co w migracji 0071 — bez zmiany kształtu kolumn, więc
--     create or replace wystarczy (bez drop function).
create or replace function public.admin_set_tournament_status(
  p_tournament_id uuid, p_new_status text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_legal text[];
  v_min_teams integer;
  v_approved_count integer;
begin
  if v_actor is null or not public.is_app_admin() then
    return 'not_admin';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  if not found then return 'not_found'; end if;

  v_legal := case v_status
    when 'draft' then array['registration_open', 'cancelled']
    when 'registration_open' then array['registration_closed', 'cancelled']
    when 'registration_closed' then array['ready', 'registration_open', 'cancelled']
    when 'ready' then array['in_progress', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    else array[]::text[]
  end;

  if p_new_status is null or not (p_new_status = any(v_legal)) then
    return 'invalid_transition';
  end if;

  if v_status = 'registration_closed' and p_new_status = 'ready' then
    select min_teams into v_min_teams from public.tournaments where id = p_tournament_id;
    select count(*) into v_approved_count
      from public.tournament_teams
      where tournament_id = p_tournament_id and status = 'approved';
    if v_approved_count < v_min_teams then
      return 'not_enough_teams';
    end if;
  end if;

  update public.tournaments set status = p_new_status where id = p_tournament_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'set_tournament_status', 'tournament', p_tournament_id,
    jsonb_build_object('from', v_status, 'to', p_new_status));

  return 'ok';
end;
$$;

revoke all on function public.admin_set_tournament_status(uuid, text) from public;
grant execute on function public.admin_set_tournament_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
