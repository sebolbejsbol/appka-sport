# Phase 3: Team Registration Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a team's owner/admin register the team for a tournament, let the tournament admin approve/reject/remove registrations and slot approved teams into groups, and surface a live registered-teams list on the public tournament page. Closes an existing Phase 2 gap by enforcing `min_teams` on the `registration_closed -> ready` transition.

**Architecture:** Same pattern as Phase 2: `SECURITY DEFINER` RPCs gated by `is_app_admin()` (admin actions) or `is_team_manager()` (team actions — an existing, live helper reused as-is), string-status-code returns, every mutation logs to `admin_audit_log`. Frontend follows `admin/tournaments/index.tsx`'s list-screen shape and `tournament/[id].tsx`'s existing structure.

**Tech Stack:** Expo Router (React Native + react-native-web), Supabase (Postgres + RLS), TypeScript, i18n via `t()`. No JS test runner — SQL behavior verified with `do $$ ... $$` assertion scripts under `supabase/tests/`, run manually via `scripts/run-supabase-sql.mjs`. TypeScript verified with `npx tsc --noEmit`.

## Global Constraints

- Expo SDK 56 — check https://docs.expo.dev/versions/v56.0.0/ before using any Expo API not already used elsewhere in this codebase.
- Migrations are plain numbered `.sql` files in `supabase/migrations/`, applied via `node scripts/run-supabase-sql.mjs <path>` (every invocation prompts for permission — approve it live) or manually via Supabase Dashboard → SQL Editor. Every migration must be idempotent (`create table if not exists`, `create index if not exists`, `drop policy if exists` before every `create policy`).
- **This repo's `supabase/migrations/` directory is NOT a complete record of the live schema.** The team join-request system (`team_join_requests` table, `request_join_team`/`respond_team_join_request`/`list_team_join_requests`/`cancel_join_request` functions, `is_team_manager`/`is_team_member` helpers) exists live with no corresponding migration file anywhere in git history. This plan's SQL below was written directly against the live function/table definitions (pulled via `pg_get_functiondef`/`information_schema.columns`), not inferred from local files. If any task needs to check another pre-existing function/table not covered by this plan's Interfaces blocks, query the live database directly rather than trusting an absence of a matching migration file.
- All new RPCs follow the existing status-code-return convention (`'ok' | 'not_admin' | ...`), not thrown exceptions. `is_app_admin()` gates admin-only writes (unchanged from Phase 1/2). `is_team_manager(p_team_id uuid, p_user_id uuid) returns boolean` (existing, live, reused as-is) gates team-side writes — true for a `team_members` row with `role in ('owner', 'admin')`.
- All new/changed `.sql` functions: `revoke all ... from public; grant execute ... to authenticated;`, and the migration ends with `notify pgrst, 'reload schema';`.
- i18n's `t()` has no interpolation (`t(key: TKey): string` only) — never build a dynamic key path from a variable; use explicit if/else per literal key.
- Read `docs/superpowers/specs/2026-08-10-tournament-phase3-team-registration-design.md` in full before starting; this plan implements it.

---

## Task 1: Migration 0073 — `tournament_teams` table, RLS, and 7 RPCs, plus `admin_set_tournament_status`'s new `not_enough_teams` gate

**Files:**
- Create: `supabase/migrations/0073_tournament_teams.sql`

**Interfaces:**
- Consumes: `public.tournaments`, `public.tournament_groups`, `public.teams`, `public.team_members` (all existing), `public.is_app_admin()`, `public.is_team_manager(uuid, uuid)` (existing, live — do not redefine), `public.admin_audit_log` (existing).
- Produces (consumed by Task 3 and later tasks):
  - Table `public.tournament_teams`
  - `public.register_team_for_tournament(p_tournament_id uuid, p_team_id uuid) returns text`
  - `public.withdraw_team_registration(p_tournament_id uuid, p_team_id uuid) returns text`
  - `public.admin_respond_team_registration(p_registration_id uuid, p_accept boolean) returns text`
  - `public.admin_remove_team_registration(p_registration_id uuid) returns text`
  - `public.admin_assign_team_group(p_registration_id uuid, p_group_id uuid) returns text`
  - `public.list_tournament_team_registrations(p_tournament_id uuid, p_admin_view boolean default false) returns table(id uuid, team_id uuid, team_name text, team_logo_url text, team_sport text, status text, group_id uuid, group_name text, requested_by uuid, created_at timestamptz, responded_at timestamptz)`
  - `public.get_my_team_registration_status(p_tournament_id uuid, p_team_id uuid) returns text`
  - `public.admin_set_tournament_status` — modified (`create or replace`, same signature, no column-shape change) to add the `not_enough_teams` gate on `registration_closed -> ready`.

- [ ] **Step 1: Write the migration file**

```sql
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
    from public.tournaments where id = p_tournament_id;
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
    select max_teams into v_max_teams from public.tournaments where id = v_tournament_id;
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
```

- [ ] **Step 2: Apply the migration**

Run `node scripts/run-supabase-sql.mjs supabase/migrations/0073_tournament_teams.sql` (approve the permission prompt). Confirm no errors.

- [ ] **Step 3: Sanity-check in the SQL editor**

Run: `select table_name from information_schema.tables where table_name = 'tournament_teams';`
Expected: one row.

Run: `select proname from pg_proc where proname in ('register_team_for_tournament', 'withdraw_team_registration', 'admin_respond_team_registration', 'admin_remove_team_registration', 'admin_assign_team_group', 'list_tournament_team_registrations', 'get_my_team_registration_status');`
Expected: all 7 rows present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0073_tournament_teams.sql
git commit -m "Add team registration data model, RPCs, and min_teams gate on ready transition"
```

---

## Task 2: SQL behavior test for the team-registration RPCs

**Files:**
- Create: `supabase/tests/tournament_teams_test.sql`

**Interfaces:**
- Consumes: everything from Task 1, plus `public.admin_create_tournament` (Phase 2), and requires at least one `admin`/`super_admin` profile, one `user`-role profile who owns/manages a `basketball`-sport team, and one other `user`-role profile with no team management rights, to already exist. Check `select id, role from public.profiles;` and `select t.id, t.sport, tm.user_id, tm.role from public.teams t join public.team_members tm on tm.team_id = t.id where tm.role in ('owner','admin');` in the SQL editor first to find real ids to hardcode, OR create fresh fixtures inline in the test (preferred — matches `tournaments_test.sql`'s own self-contained style; do not rely on incidental existing data).

- [ ] **Step 1: Write the test script**

```sql
-- ============================================================================
-- Rejestracja drużyn na turniej — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin, 1 profil user zarządzający
-- drużyną koszykarską (owner/admin w team_members), 1 profil user bez drużyny.
-- Tworzy własny fikcyjny turniej i własną fikcyjną drużynę, żeby nie zależeć
-- od przypadkowych danych. Pełne przejście = brak wyjątku; tabela _t na końcu
-- zawiera zaliczone kroki. Sprząta po sobie fikcyjny turniej i drużynę.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_manager uuid; v_outsider uuid;
  v_tournament_id uuid; v_team_id uuid; v_other_team_id uuid;
  v_status text; v_reg_id uuid; v_group_id uuid; v_group2_id uuid;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_manager from public.profiles where role = 'user' order by created_at limit 1;
  select id into v_outsider from public.profiles where role = 'user' order by created_at offset 1 limit 1;
  if v_admin is null or v_manager is null or v_outsider is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 2 profile user';
  end if;

  -- Fikcyjna drużyna zarządzana przez v_manager
  insert into public.teams (name, sport, owner_id) values ('Test Registration FC', 'basketball', v_manager)
  returning id into v_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_team_id, v_manager, 'owner');
  insert into _t values ('fixture: manager team created OK');

  -- Druga fikcyjna drużyna, złego sportu (do testu wrong_sport), też v_manager
  insert into public.teams (name, sport, owner_id) values ('Test Registration Volley', 'volleyball', v_manager)
  returning id into v_other_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_other_team_id, v_manager, 'owner');

  -- Fikcyjny turniej koszykarski, max_teams=1 (żeby łatwo przetestować tournament_full), 2 grupy
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_tournament_id from public.admin_create_tournament(
    'Registration Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    1, 1, 5, 0, true, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'ok' or v_tournament_id is null then raise exception 'FAIL tournament fixture create, got %', v_status; end if;
  select id into v_group_id from public.tournament_groups where tournament_id = v_tournament_id order by sort_order limit 1;
  select id into v_group2_id from public.tournament_groups where tournament_id = v_tournament_id order by sort_order offset 1 limit 1;
  insert into _t values ('fixture: tournament (max_teams=1, requires_approval) created OK');

  -- 1) Nie-manager nie może zarejestrować cudzej drużyny
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'not_team_manager' then raise exception 'FAIL non-manager register blocked, got %', v_status; end if;
  insert into _t values ('non-manager register blocked OK');

  -- 2) Rejestracja przed otwarciem zapisów (turniej wciąż 'draft') -> not_open
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'not_open' then raise exception 'FAIL register before open blocked, got %', v_status; end if;
  insert into _t values ('register before registration_open blocked OK');

  -- Otwarcie zapisów
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL open registration, got %', v_status; end if;

  -- 3) Zły sport -> wrong_sport
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_other_team_id) into v_status;
  if v_status <> 'wrong_sport' then raise exception 'FAIL wrong sport blocked, got %', v_status; end if;
  insert into _t values ('wrong-sport register blocked OK');

  -- 4) Rejestracja poprawnej drużyny -> pending (requires_approval=true)
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL register team, got %', v_status; end if;
  select id, status into v_reg_id, v_status from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_team_id;
  if v_status <> 'pending' then raise exception 'FAIL expected pending, got %', v_status; end if;
  insert into _t values ('register team -> pending OK');

  -- 5) Powtórna rejestracja podczas pending -> already_registered
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'already_registered' then raise exception 'FAIL duplicate register blocked, got %', v_status; end if;
  insert into _t values ('duplicate register while pending blocked OK');

  -- 6) get_my_team_registration_status zwraca 'pending'
  select public.get_my_team_registration_status(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'pending' then raise exception 'FAIL get_my_team_registration_status, got %', v_status; end if;
  insert into _t values ('get_my_team_registration_status pending OK');

  -- 7) Nie-admin nie może zaakceptować
  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'not_admin' then raise exception 'FAIL non-admin approve blocked, got %', v_status; end if;
  insert into _t values ('non-admin approve blocked OK');

  -- 8) list_tournament_team_registrations (widok publiczny) nie pokazuje pending
  if exists (select 1 from public.list_tournament_team_registrations(v_tournament_id, false) where id = v_reg_id) then
    raise exception 'FAIL public list leaks pending registration';
  end if;
  insert into _t values ('public list excludes pending OK');

  -- 9) Admin akceptuje -> approved
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL admin approve, got %', v_status; end if;
  select status into v_status from public.tournament_teams where id = v_reg_id;
  if v_status <> 'approved' then raise exception 'FAIL expected approved, got %', v_status; end if;
  insert into _t values ('admin approve -> approved OK');

  -- 10) list_tournament_team_registrations (widok publiczny) teraz pokazuje drużynę
  if not exists (select 1 from public.list_tournament_team_registrations(v_tournament_id, false) where id = v_reg_id) then
    raise exception 'FAIL public list missing approved registration';
  end if;
  insert into _t values ('public list includes approved OK');

  -- 11) Powtórna odpowiedź na już rozpatrzone zgłoszenie -> not_pending
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'not_pending' then raise exception 'FAIL re-respond blocked, got %', v_status; end if;
  insert into _t values ('re-respond to resolved registration blocked OK');

  -- 12) Przypisanie do grupy
  select public.admin_assign_team_group(v_reg_id, v_group_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL assign group, got %', v_status; end if;
  select group_id into v_group_id from public.tournament_teams where id = v_reg_id; -- reuse var to read back
  if v_group_id is null then raise exception 'FAIL group_id not persisted'; end if;
  insert into _t values ('assign team to group OK');

  -- 13) registration_closed -> ready zablokowane, dopóki nie ma min_teams
  --     (min_teams=1, mamy 1 approved -> powinno przejść; zamiast tego testujemy
  --     odwrotny przypadek: usuwamy drużynę, sprawdzamy blokadę, potem przywracamy).
  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration, got %', v_status; end if;

  select public.admin_remove_team_registration(v_reg_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL remove approved team, got %', v_status; end if;

  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'not_enough_teams' then raise exception 'FAIL ready blocked below min_teams, got %', v_status; end if;
  insert into _t values ('ready transition blocked below min_teams OK');

  -- 14) Po ponownym zarejestrowaniu i zaakceptowaniu, ready powinno przejść
  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  -- (uwaga: powyższe wywołanie jako v_manager powinno się nie udać — sprawdzone niżej)
  if v_status <> 'not_admin' then raise exception 'FAIL non-admin reopen blocked, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL reopen registration, got %', v_status; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL re-register after removal, got %', v_status; end if;
  select id into v_reg_id from public.tournament_teams where tournament_id = v_tournament_id and team_id = v_team_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_respond_team_registration(v_reg_id, true) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL re-approve, got %', v_status; end if;
  select public.admin_set_tournament_status(v_tournament_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL close registration (2), got %', v_status; end if;
  select public.admin_set_tournament_status(v_tournament_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ready transition once min_teams met, got %', v_status; end if;
  insert into _t values ('ready transition succeeds once min_teams met OK');

  -- 15) tournament_full: drugi rejestrujący (jako inna drużina managera) nad limitem
  --     (max_teams=1, już 1 approved) -> tournament_full przy próbie rejestracji.
  --     Cofamy turniej do registration_open, żeby móc próbować.
  select public.admin_set_tournament_status(v_tournament_id, 'registration_open') into v_status;
  -- registration_closed -> registration_open jest legalne per tabela przejść
  if v_status <> 'ok' then raise exception 'FAIL reopen for full-test, got %', v_status; end if;

  insert into public.teams (name, sport, owner_id) values ('Test Registration FC 2', 'basketball', v_outsider)
  returning id into v_other_team_id;
  insert into public.team_members (team_id, user_id, role) values (v_other_team_id, v_outsider, 'owner');

  perform set_config('request.jwt.claims', json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  select public.register_team_for_tournament(v_tournament_id, v_other_team_id) into v_status;
  if v_status <> 'tournament_full' then raise exception 'FAIL tournament_full not enforced, got %', v_status; end if;
  insert into _t values ('tournament_full enforced at registration OK');

  -- 16) Wycofanie zgłoszenia
  select public.withdraw_team_registration(v_tournament_id, v_other_team_id) into v_status;
  -- v_other_team_id (druga próba) nigdy nie miała zapisanego wiersza (rejestracja
  -- odrzucona przez tournament_full), więc oczekujemy not_registered.
  if v_status <> 'not_registered' then raise exception 'FAIL withdraw of never-registered team, got %', v_status; end if;
  insert into _t values ('withdraw of never-registered team returns not_registered OK');

  perform set_config('request.jwt.claims', json_build_object('sub', v_manager, 'role', 'authenticated')::text, true);
  select public.withdraw_team_registration(v_tournament_id, v_team_id) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL withdraw approved team, got %', v_status; end if;
  select status into v_status from public.tournament_teams
    where tournament_id = v_tournament_id and team_id = v_team_id;
  if v_status <> 'withdrawn' then raise exception 'FAIL expected withdrawn, got %', v_status; end if;
  insert into _t values ('withdraw approved team -> withdrawn OK');

  -- Sprzątanie fikcyjnych danych
  delete from public.tournament_teams where tournament_id = v_tournament_id;
  delete from public.tournament_groups where tournament_id = v_tournament_id;
  delete from public.tournaments where id = v_tournament_id;
  delete from public.team_members where team_id in (v_team_id, v_other_team_id);
  delete from public.teams where id in (v_team_id, v_other_team_id);
  insert into _t values ('fixture cleanup OK');

  raise notice 'Wszystkie testy rejestracji drużyn zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
```

- [ ] **Step 2: Run it and verify**

Run: `node scripts/run-supabase-sql.mjs supabase/tests/tournament_teams_test.sql`
Expected: the final `select * from _t` returns all steps (20 rows), no exception raised. If any step fails, the fixtures created before the failure point may be left behind — check `select * from public.tournaments where name like 'Registration Test%';` and `select * from public.teams where name like 'Test Registration%';` afterward and delete manually if the cleanup step (near the end) wasn't reached.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/tournament_teams_test.sql
git commit -m "Add SQL behavior test for team registration RPCs"
```

---

## Task 3: `src/lib/tournament-teams.ts` — types and RPC wrappers

**Files:**
- Create: `src/lib/tournament-teams.ts`

**Interfaces:**
- Consumes: the 7 RPCs from Task 1.
- Produces: `TournamentTeamStatus`, `TournamentTeamRegistration`, `registerTeamForTournament`, `withdrawTeamRegistration`, `adminRespondTeamRegistration`, `adminRemoveTeamRegistration`, `adminAssignTeamGroup`, `listTournamentTeamRegistrations`, `getMyTeamRegistrationStatus` — consumed by Tasks 5-6 (screens).

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/tournament-teams.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament-teams.ts
git commit -m "Add team-registration RPC wrappers and types"
```

---

## Task 4: i18n — team-registration namespaces (en + pl), and the new `not_enough_teams` transition message

**Files:**
- Modify: `src/i18n/en.ts` — insert a new `tournamentTeams` block right after the `tournamentDetail` block ends (it's the last block Phase 2/the discoverability work added; find it by searching for `tournamentDetail: {` and locating its closing `},`), and add one key inside the existing `tournamentForm` block.
- Modify: `src/i18n/pl.ts` — same two insertions, mirrored.

**Interfaces:**
- Produces every `t('tournamentTeams.*')` key used below, plus `t('tournamentForm.transitionNotEnoughTeams')` — consumed by Tasks 5-7.

- [ ] **Step 1: `en.ts` — add `transitionNotEnoughTeams` to the existing `tournamentForm` block**

Inside `tournamentForm: { ... }`, add right after `transitionError:`:

```ts
    transitionNotEnoughTeams: 'Not enough approved teams yet to mark this tournament ready.',
```

- [ ] **Step 2: `en.ts` — add the new `tournamentTeams` namespace**

Right after the `tournamentDetail: { ... }` block closes, insert:

```ts
  tournamentTeams: {
    sectionTitle: 'Registered teams',
    countLabel: 'teams',
    empty: 'No teams registered yet.',
    registerSectionTitle: 'Register your team',
    pickTeamHint: 'Choose one of your teams to register.',
    registerAction: 'Register team',
    withdrawAction: 'Withdraw',
    statusPending: 'Registration pending approval',
    statusApproved: "You're registered",
    statusRejected: 'Registration was not accepted',
    statusWithdrawn: 'You withdrew this registration',
    registerError: 'Could not register your team. Try again.',
    withdrawError: 'Could not withdraw. Try again.',
    withdrawConfirmTitle: 'Withdraw your team?',
    withdrawConfirmMessage: 'Your team will leave this tournament.',
    manageTitle: 'Manage teams',
    managePending: 'pending',
    filterAll: 'All',
    filterPending: 'Pending',
    filterApproved: 'Approved',
    filterRejected: 'Rejected',
    empty404: 'No registrations for this filter.',
    approveAction: 'Approve',
    rejectAction: 'Reject',
    removeAction: 'Remove',
    removeConfirmTitle: 'Remove this team?',
    removeConfirmMessage: 'The team will be removed from the tournament.',
    actionError: 'Could not complete this action. Try again.',
    assignGroupLabel: 'Group',
    assignGroupNone: 'No group',
    loadError: 'Could not load team registrations.',
  },
```

- [ ] **Step 3: `pl.ts` — add `transitionNotEnoughTeams`**

Inside `tournamentForm: { ... }`, add right after `transitionError:`:

```ts
    transitionNotEnoughTeams: 'Za mało zaakceptowanych drużyn, aby oznaczyć turniej jako gotowy.',
```

- [ ] **Step 4: `pl.ts` — add the new `tournamentTeams` namespace**

Right after the `tournamentDetail: { ... }` block closes, insert:

```ts
  tournamentTeams: {
    sectionTitle: 'Zarejestrowane drużyny',
    countLabel: 'drużyn',
    empty: 'Brak zarejestrowanych drużyn.',
    registerSectionTitle: 'Zarejestruj swoją drużynę',
    pickTeamHint: 'Wybierz jedną ze swoich drużyn do rejestracji.',
    registerAction: 'Zarejestruj drużynę',
    withdrawAction: 'Wycofaj',
    statusPending: 'Zgłoszenie czeka na akceptację',
    statusApproved: 'Jesteś zarejestrowany',
    statusRejected: 'Zgłoszenie nie zostało zaakceptowane',
    statusWithdrawn: 'Wycofałeś to zgłoszenie',
    registerError: 'Nie udało się zarejestrować drużyny. Spróbuj ponownie.',
    withdrawError: 'Nie udało się wycofać zgłoszenia. Spróbuj ponownie.',
    withdrawConfirmTitle: 'Wycofać drużynę?',
    withdrawConfirmMessage: 'Twoja drużyna opuści ten turniej.',
    manageTitle: 'Zarządzaj drużynami',
    managePending: 'oczekujących',
    filterAll: 'Wszystkie',
    filterPending: 'Oczekujące',
    filterApproved: 'Zaakceptowane',
    filterRejected: 'Odrzucone',
    empty404: 'Brak zgłoszeń dla tego filtra.',
    approveAction: 'Akceptuj',
    rejectAction: 'Odrzuć',
    removeAction: 'Usuń',
    removeConfirmTitle: 'Usunąć tę drużynę?',
    removeConfirmMessage: 'Drużyna zostanie usunięta z turnieju.',
    actionError: 'Nie udało się wykonać tej akcji. Spróbuj ponownie.',
    assignGroupLabel: 'Grupa',
    assignGroupNone: 'Brak grupy',
    loadError: 'Nie udało się wczytać zgłoszeń drużyn.',
  },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (`pl.ts` must define every key `en.ts` does, since `TKey` is derived from `en.ts` — actually check `src/i18n/index.ts`/`pl.ts` to confirm which file is the type source; match whichever file already has `type Translations` exported, and ensure the other file's `DeepPartialWide<Translations>` typing doesn't break — add keys to both regardless).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/pl.ts
git commit -m "Add team-registration i18n namespaces"
```

---

## Task 5: `src/lib/tournaments.ts` — add `not_enough_teams` to `SetTournamentStatusResult`

**Files:**
- Modify: `src/lib/tournaments.ts`

**Interfaces:**
- Consumes: Task 1's modified `admin_set_tournament_status`.
- Produces: `SetTournamentStatusResult` gains `'not_enough_teams'` — consumed by Task 7 (edit.tsx's transition-error branching).

- [ ] **Step 1: Update the type**

Find:

```ts
export type SetTournamentStatusResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_transition'
  | 'error';
```

Replace with:

```ts
export type SetTournamentStatusResult =
  | 'ok'
  | 'not_admin'
  | 'not_found'
  | 'invalid_transition'
  | 'not_enough_teams'
  | 'error';
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournaments.ts
git commit -m "Add not_enough_teams to SetTournamentStatusResult"
```

---

## Task 6: Public tournament page — live registered-teams list and register/withdraw UI

**Files:**
- Modify: `src/app/(app)/tournament/[id].tsx`

**Interfaces:**
- Consumes: `listTournamentTeamRegistrations`, `getMyTeamRegistrationStatus`, `registerTeamForTournament`, `withdrawTeamRegistration` (Task 3); `listMyTeams` (existing, `src/lib/teams.ts`); `confirmAction` (existing, `src/lib/confirm.ts`).

- [ ] **Step 1: Add imports and new state**

Find:

```ts
import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import { goBack } from '@/lib/navigation';
import { getTournamentDetail, type Tournament, type TournamentStatus } from '@/lib/tournaments';
```

Replace with:

```ts
import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import { formatTeamSport } from '@/lib/sports';
import { listMyTeams, type TeamListItem } from '@/lib/teams';
import {
  getMyTeamRegistrationStatus,
  listTournamentTeamRegistrations,
  registerTeamForTournament,
  withdrawTeamRegistration,
  type TournamentTeamRegistration,
  type TournamentTeamStatus,
} from '@/lib/tournament-teams';
import { getTournamentDetail, type Tournament, type TournamentStatus } from '@/lib/tournaments';
```

- [ ] **Step 2: Add new state and a combined loader**

Find:

```ts
export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const { data } = await getTournamentDetail(tournamentId);
    setTournament(data);
    setNotFound(!data);
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
```

Replace with:

```ts
export default function TournamentDetailScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [registrations, setRegistrations] = useState<TournamentTeamRegistration[]>([]);
  const [myTeams, setMyTeams] = useState<TeamListItem[]>([]);
  const [myStatuses, setMyStatuses] = useState<Record<string, TournamentTeamStatus>>({});
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const [{ data }, regsResult, teamsResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentTeamRegistrations(tournamentId, false),
      listMyTeams(),
    ]);
    setTournament(data);
    setNotFound(!data);
    setRegistrations(regsResult.data);

    if (data) {
      const eligible = teamsResult.data.filter(
        (team) =>
          (team.my_role === 'owner' || team.my_role === 'admin') && team.sport === data.sport,
      );
      setMyTeams(eligible);
      const statuses = await Promise.all(
        eligible.map((team) => getMyTeamRegistrationStatus(tournamentId, team.team_id)),
      );
      const map: Record<string, TournamentTeamStatus> = {};
      eligible.forEach((team, i) => {
        map[team.team_id] = statuses[i];
      });
      setMyStatuses(map);
      setSelectedTeamId((prev) => prev ?? eligible.find((t) => map[t.team_id] === 'none')?.team_id ?? null);
    } else {
      setMyTeams([]);
      setMyStatuses({});
    }

    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
```

- [ ] **Step 3: Add register/withdraw handlers**

Find the closing of the `load` callback's `useFocusEffect` block (immediately after it, before the `if (loading) {` block), and insert:

```ts
  async function handleRegister() {
    if (!tournamentId || !selectedTeamId) return;
    setRegBusy(true);
    setRegError(null);
    const result = await registerTeamForTournament(tournamentId, selectedTeamId);
    setRegBusy(false);
    if (result !== 'ok') {
      setRegError(t('tournamentTeams.registerError'));
      return;
    }
    void load();
  }

  function confirmWithdraw(teamId: string) {
    confirmAction(
      t('tournamentTeams.withdrawConfirmTitle'),
      t('tournamentTeams.withdrawConfirmMessage'),
      t('tournamentTeams.withdrawAction'),
      t('common.cancel'),
      () => void handleWithdraw(teamId),
      true,
    );
  }

  async function handleWithdraw(teamId: string) {
    if (!tournamentId) return;
    setRegBusy(true);
    setRegError(null);
    const result = await withdrawTeamRegistration(tournamentId, teamId);
    setRegBusy(false);
    if (result !== 'ok') {
      setRegError(t('tournamentTeams.withdrawError'));
      return;
    }
    void load();
  }
```

- [ ] **Step 4: Render the registered-teams list, replacing the static placeholder**

Find:

```tsx
          {tournament.registration_opens_at ? (
            <Text style={styles.infoLine}>
              {t('tournamentDetail.registrationOpensLabel')}: {new Date(tournament.registration_opens_at).toLocaleString()}
            </Text>
          ) : null}
          <Text style={styles.infoLine}>
            {t('tournamentDetail.registrationClosesLabel')}: {new Date(tournament.registration_closes_at).toLocaleString()}
          </Text>
          <Text style={styles.infoLine}>
            0 / {tournament.max_teams} {t('tournamentDetail.teamsRegistered')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
```

Replace with:

```tsx
          {tournament.registration_opens_at ? (
            <Text style={styles.infoLine}>
              {t('tournamentDetail.registrationOpensLabel')}: {new Date(tournament.registration_opens_at).toLocaleString()}
            </Text>
          ) : null}
          <Text style={styles.infoLine}>
            {t('tournamentDetail.registrationClosesLabel')}: {new Date(tournament.registration_closes_at).toLocaleString()}
          </Text>
          <Text style={styles.infoLine}>
            {registrations.length} / {tournament.max_teams} {t('tournamentDetail.teamsRegistered')}
          </Text>
        </View>

        {myTeams.length > 0 && tournament.status === 'registration_open' ? (
          <View style={styles.registerBlock}>
            <Text style={styles.sectionHeading}>{t('tournamentTeams.registerSectionTitle')}</Text>
            {(() => {
              const unregistered = myTeams.filter((team) => myStatuses[team.team_id] === 'none');
              const registeredTeam = myTeams.find((team) => {
                const s = myStatuses[team.team_id];
                return s === 'pending' || s === 'approved';
              });

              if (registeredTeam) {
                const s = myStatuses[registeredTeam.team_id];
                return (
                  <View style={styles.myRegRow}>
                    <Text style={styles.myRegText}>
                      {registeredTeam.name} — {s === 'approved' ? t('tournamentTeams.statusApproved') : t('tournamentTeams.statusPending')}
                    </Text>
                    <Button
                      label={t('tournamentTeams.withdrawAction')}
                      variant="secondary"
                      onPress={() => confirmWithdraw(registeredTeam.team_id)}
                      disabled={regBusy}
                    />
                  </View>
                );
              }

              if (unregistered.length === 0) return null;

              return (
                <>
                  <Text style={styles.pickHint}>{t('tournamentTeams.pickTeamHint')}</Text>
                  <View style={styles.teamChipsRow}>
                    {unregistered.map((team) => (
                      <Pressable
                        key={team.team_id}
                        onPress={() => setSelectedTeamId(team.team_id)}
                        style={[styles.teamChip, selectedTeamId === team.team_id && styles.teamChipActive]}>
                        <Text
                          style={[
                            styles.teamChipText,
                            selectedTeamId === team.team_id && styles.teamChipTextActive,
                          ]}>
                          {team.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button
                    label={t('tournamentTeams.registerAction')}
                    onPress={handleRegister}
                    disabled={regBusy || !selectedTeamId}
                    style={styles.registerBtn}
                  />
                </>
              );
            })()}
            {regError ? <Text style={styles.regErrorText}>{regError}</Text> : null}
          </View>
        ) : null}

        <View style={styles.teamsBlock}>
          <Text style={styles.sectionHeading}>{t('tournamentTeams.sectionTitle')}</Text>
          {registrations.length === 0 ? (
            <Text style={styles.emptyText}>{t('tournamentTeams.empty')}</Text>
          ) : (
            registrations.map((reg) => (
              <View key={reg.id} style={styles.teamRow}>
                {reg.team_logo_url ? (
                  <Image source={{ uri: reg.team_logo_url }} style={styles.teamLogo} />
                ) : (
                  <View style={styles.teamLogoFallback} />
                )}
                <Text style={styles.teamRowName}>{reg.team_name}</Text>
                {reg.group_name ? <Text style={styles.teamRowGroup}>{reg.group_name}</Text> : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 5: Add the new styles**

Find:

```ts
  infoBlock: { gap: 8 },
  infoLine: { fontSize: 14, color: Brand.textSecondary },
});
```

Replace with:

```ts
  infoBlock: { gap: 8 },
  infoLine: { fontSize: 14, color: Brand.textSecondary },
  sectionHeading: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 10 },
  registerBlock: { marginTop: 24 },
  pickHint: { fontSize: 13, color: Brand.textMuted, marginBottom: 8 },
  teamChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  teamChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  teamChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  teamChipText: { fontSize: 13, fontWeight: '600', color: Brand.textPrimary },
  teamChipTextActive: { color: Brand.primaryText },
  registerBtn: { marginTop: 4 },
  myRegRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  myRegText: { flex: 1, fontSize: 14, color: Brand.textPrimary },
  regErrorText: { fontSize: 13, color: Brand.danger, marginTop: 8 },
  teamsBlock: { marginTop: 24 },
  emptyText: { fontSize: 14, color: Brand.textMuted },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  teamLogo: { width: 32, height: 32, borderRadius: 8, backgroundColor: Brand.surface },
  teamLogoFallback: { width: 32, height: 32, borderRadius: 8, backgroundColor: Brand.surfaceMuted },
  teamRowName: { flex: 1, fontSize: 14, color: Brand.textPrimary, fontWeight: '600' },
  teamRowGroup: { fontSize: 12, color: Brand.textMuted },
});
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If `Brand.surfaceMuted`, `Brand.primaryText`, or `Brand.danger` don't exist under those exact names, check `src/constants/theme.ts` and use whatever the existing equivalent tokens are named (they're already used elsewhere in this codebase — e.g. `tournament-card.tsx` uses `Brand.surfaceMuted`, `events/index.tsx` uses `Brand.primaryText` and `Brand.danger` is used in `field-report-map-picker.tsx` — these should already exist, but verify before assuming).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/tournament/[id].tsx"
git commit -m "Add team registration UI to the public tournament page"
```

---

## Task 7: New admin screen — `/admin/tournaments/[id]/teams.tsx`

**Files:**
- Create: `src/app/(app)/admin/tournaments/[id]/teams.tsx`

**Interfaces:**
- Consumes: `listTournamentTeamRegistrations`, `adminRespondTeamRegistration`, `adminRemoveTeamRegistration`, `adminAssignTeamGroup` (Task 3); `getTournamentDetail` (existing, for the tournament's `groups` to populate the group-assignment chips); `confirmAction` (existing).

- [ ] **Step 1: Write the file**

```tsx
import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Brand } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { goBack } from '@/lib/navigation';
import {
  adminAssignTeamGroup,
  adminRemoveTeamRegistration,
  adminRespondTeamRegistration,
  listTournamentTeamRegistrations,
  type TournamentTeamRegistration,
} from '@/lib/tournament-teams';
import { getTournamentDetail, type Tournament } from '@/lib/tournaments';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function filterLabel(filter: StatusFilter): string {
  switch (filter) {
    case 'pending': return t('tournamentTeams.filterPending');
    case 'approved': return t('tournamentTeams.filterApproved');
    case 'rejected': return t('tournamentTeams.filterRejected');
    default: return t('tournamentTeams.filterAll');
  }
}

export default function ManageTournamentTeamsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<TournamentTeamRegistration[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId || !isAdmin) return;
    setLoading(true);
    const [{ data: detail }, regsResult] = await Promise.all([
      getTournamentDetail(tournamentId),
      listTournamentTeamRegistrations(tournamentId, true),
    ]);
    setTournament(detail);
    setRegistrations(regsResult.data);
    setLoadError(Boolean(regsResult.error));
    setLoading(false);
  }, [tournamentId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visible = registrations.filter((r) => filter === 'all' || r.status === filter);
  const pendingCount = registrations.filter((r) => r.status === 'pending').length;

  async function handleRespond(registrationId: string, accept: boolean) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminRespondTeamRegistration(registrationId, accept);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  function confirmRemove(registrationId: string) {
    confirmAction(
      t('tournamentTeams.removeConfirmTitle'),
      t('tournamentTeams.removeConfirmMessage'),
      t('tournamentTeams.removeAction'),
      t('common.cancel'),
      () => void handleRemove(registrationId),
      true,
    );
  }

  async function handleRemove(registrationId: string) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminRemoveTeamRegistration(registrationId);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  async function handleAssignGroup(registrationId: string, groupId: string | null) {
    setBusyId(registrationId);
    setActionError(null);
    const result = await adminAssignTeamGroup(registrationId, groupId);
    setBusyId(null);
    if (result !== 'ok') {
      setActionError(t('tournamentTeams.actionError'));
      return;
    }
    void load();
  }

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <ScreenHeader insetTop={insets.top} title={t('tournamentTeams.manageTitle')} onBack={() => goBack('/admin/tournaments' as Href)} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={tournament ? `${t('tournamentTeams.manageTitle')} — ${tournament.name}` : t('tournamentTeams.manageTitle')}
        onBack={() => goBack({ pathname: '/admin/tournaments/[id]/edit', params: { id: tournamentId ?? '' } } as Href)}
      />

      <View style={styles.filtersRow}>
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {filterLabel(f)}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('tournamentTeams.loadError')}</Text>
      ) : visible.length === 0 ? (
        <Text style={styles.muted}>{t('tournamentTeams.empty404')}</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}>
          {visible.map((reg) => (
            <View key={reg.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle}>{reg.team_name}</Text>
                <Text style={styles.rowStatus}>{reg.status}</Text>
              </View>

              {reg.status === 'pending' ? (
                <View style={styles.actionsRow}>
                  <Button
                    label={t('tournamentTeams.approveAction')}
                    onPress={() => void handleRespond(reg.id, true)}
                    disabled={busyId === reg.id}
                    style={styles.actionBtn}
                  />
                  <Button
                    label={t('tournamentTeams.rejectAction')}
                    variant="secondary"
                    onPress={() => void handleRespond(reg.id, false)}
                    disabled={busyId === reg.id}
                    style={styles.actionBtn}
                  />
                </View>
              ) : null}

              {reg.status === 'approved' ? (
                <>
                  <View style={styles.actionsRow}>
                    <Button
                      label={t('tournamentTeams.removeAction')}
                      variant="danger"
                      onPress={() => confirmRemove(reg.id)}
                      disabled={busyId === reg.id}
                      style={styles.actionBtn}
                    />
                  </View>
                  {tournament && tournament.groups.length > 0 ? (
                    <View style={styles.groupRow}>
                      <Text style={styles.groupLabel}>{t('tournamentTeams.assignGroupLabel')}:</Text>
                      <Pressable
                        onPress={() => void handleAssignGroup(reg.id, null)}
                        style={[styles.groupChip, !reg.group_id && styles.groupChipActive]}>
                        <Text style={[styles.groupChipText, !reg.group_id && styles.groupChipTextActive]}>
                          {t('tournamentTeams.assignGroupNone')}
                        </Text>
                      </Pressable>
                      {tournament.groups.map((g) => (
                        <Pressable
                          key={g.id}
                          onPress={() => void handleAssignGroup(reg.id, g.id)}
                          style={[styles.groupChip, reg.group_id === g.id && styles.groupChipActive]}>
                          <Text
                            style={[
                              styles.groupChipText,
                              reg.group_id === g.id && styles.groupChipTextActive,
                            ]}>
                            {g.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  actionErrorText: { fontSize: 13, color: Brand.danger, marginTop: 8, marginHorizontal: 20 },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  filterChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Brand.textPrimary },
  filterChipTextActive: { color: Brand.primaryText },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
    gap: 10,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Brand.textPrimary },
  rowStatus: { fontSize: 12, fontWeight: '600', color: Brand.textMuted },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  groupLabel: { fontSize: 13, color: Brand.textSecondary, marginRight: 2 },
  groupChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  groupChipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  groupChipText: { fontSize: 12, fontWeight: '600', color: Brand.textPrimary },
  groupChipTextActive: { color: Brand.primaryText },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: a spurious typed-routes error for the new route file is possible here (see Task 9) — no *other* new errors. Verify `Button`'s `variant` prop accepts `'danger'` (used in `edit.tsx` already for the cancel-tournament transition button) and that `goBack` accepts an object-shaped `Href` (check `src/lib/navigation.ts`'s `goBack` signature — if it only accepts a string path, change the `onBack` call to `router.replace({ pathname: '/admin/tournaments/[id]/edit', params: { id: tournamentId ?? '' } })` instead, importing `router` from `expo-router`, and drop the `goBack` import).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/tournaments/[id]/teams.tsx"
git commit -m "Add admin screen for managing tournament team registrations"
```

---

## Task 8: Link "Manage teams" from the edit screen, and handle `not_enough_teams` in the transition-error message

**Files:**
- Modify: `src/app/(app)/admin/tournaments/[id]/edit.tsx`

**Interfaces:**
- Consumes: Task 7's new screen route (`/admin/tournaments/[id]/teams`), Task 5's updated `SetTournamentStatusResult`.

- [ ] **Step 1: Add the navigation import and a "Manage teams" button**

Find:

```ts
import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
```

Replace with:

```ts
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
```

Find:

```tsx
          <TournamentForm value={value} onChange={onChange} disabled={busy || !editable} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editable ? (
            <Button label={t('tournamentForm.saveAction')} onPress={handleSave} disabled={busy} style={styles.submit} />
          ) : null}
```

Replace with:

```tsx
          <TournamentForm value={value} onChange={onChange} disabled={busy || !editable} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editable ? (
            <Button label={t('tournamentForm.saveAction')} onPress={handleSave} disabled={busy} style={styles.submit} />
          ) : null}

          <Button
            label={t('tournamentTeams.manageTitle')}
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/admin/tournaments/[id]/teams', params: { id: tournamentId ?? '' } })
            }
            style={styles.manageTeamsBtn}
          />
```

- [ ] **Step 2: Add the button's style**

Find:

```ts
  submit: { marginTop: 20 },
```

Replace with:

```ts
  submit: { marginTop: 20 },
  manageTeamsBtn: { marginTop: 12 },
```

- [ ] **Step 3: Handle `not_enough_teams` with a specific message**

Find:

```ts
  async function handleTransition(target: TournamentStatus) {
    if (!tournamentId) return;
    setBusy(true);
    setError(null);
    const result = await setTournamentStatus(tournamentId, target);
    setBusy(false);
    if (result !== 'ok') {
      setError(t('tournamentForm.transitionError'));
      return;
    }
    void load();
  }
```

Replace with:

```ts
  async function handleTransition(target: TournamentStatus) {
    if (!tournamentId) return;
    setBusy(true);
    setError(null);
    const result = await setTournamentStatus(tournamentId, target);
    setBusy(false);
    if (result === 'not_enough_teams') {
      setError(t('tournamentForm.transitionNotEnoughTeams'));
      return;
    }
    if (result !== 'ok') {
      setError(t('tournamentForm.transitionError'));
      return;
    }
    void load();
  }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors beyond the possible typed-routes false positive addressed in Task 9.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/admin/tournaments/[id]/edit.tsx"
git commit -m "Link team-registration management from the tournament edit screen"
```

---

## Task 9: Regenerate typed routes and end-to-end verification

**Files:** none created — this task clears the typed-routes false positive introduced by Task 7's new route file and walks the design spec's testing checklist.

**Interfaces:**
- Consumes: everything from Tasks 1-8.

- [ ] **Step 1: Regenerate Expo Router's typed-routes cache**

The new route file (`admin/tournaments/[id]/teams.tsx`) means `.expo/types/router.d.ts` is stale in whichever checkout you're working in (see this plan's Global Constraints note on `.expo/` being per-directory, not per-repo). Run:

```bash
npx tsc --noEmit > baseline-before.txt
CI=1 npx expo start --web --port 8095 &
sleep 3
curl -s http://localhost:8095/ > /dev/null
kill %1 2>/dev/null
npx tsc --noEmit > baseline-after.txt
```

(Adjust the port if 8095 is occupied.) Diff `baseline-after.txt` against `baseline-before.txt`. Expected: zero errors originating in any file this plan created or touched; only the repo's existing ~15 pre-existing unrelated errors (map/CSS imports) remain.

- [ ] **Step 2: Register → approve → group-assign round-trip in the UI**

As a user who manages a team matching a tournament's sport, open that tournament's public page while it's `registration_open`, register the team, confirm the page shows "pending" (if the tournament requires approval) or "You're registered" immediately (if it doesn't). As an admin, open `/admin/tournaments/[id]/teams` from the edit screen's new "Manage teams" button, approve the pending registration, confirm it now shows under "Approved," assign it to a group via the group chips, confirm the chip highlights correctly and persists after a reload.

- [ ] **Step 3: Full-tournament and wrong-sport checks**

As a second team manager (different team, same sport), register once more teams than `max_teams` allows — confirm the last one is rejected client-side with the registration error message (backend returns `tournament_full`). As a manager of a team with a different sport than the tournament, confirm no register UI appears for that team on the tournament page at all (client-side sport filter in `listMyTeams()` usage).

- [ ] **Step 4: `not_enough_teams` gate**

On a tournament with more `min_teams` than currently-approved teams, close registration and attempt to mark it "Ready" — confirm the specific "not enough approved teams" message appears (not the generic transition-error message), and that approving enough teams and retrying succeeds.

- [ ] **Step 5: Withdraw flow**

As a team manager with an approved or pending registration, withdraw it from the public tournament page — confirm the registration disappears from the public "Registered teams" list (if it was approved) and that re-registering afterward works (reuses the same underlying row per the `on conflict` upsert in Task 1).

- [ ] **Step 6: Audit log check**

In the SQL editor, run `select * from public.admin_list_audit_log('tournament_team', 20);` and confirm `register_team`, `approve_team_registration`/`reject_team_registration`, `assign_team_group`, and `remove_team_registration`/`withdraw_team_registration` rows are present for the actions performed above.

- [ ] **Step 7: Confirm Phase 1/2 features still work**

Open `/admin/users`, `/admin/reports`, `/admin/tournaments` (the list), and the main Events screen as the same admin account and confirm all still function — proving nothing in this phase's changes regressed earlier phases.

No commit for this task — it's verification only. If any step fails, return to the relevant earlier task, fix, and re-run this checklist from the affected step onward.
