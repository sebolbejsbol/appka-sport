# Phase 2: Tournament Data Model, Creation & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tournament "shell" — the `tournaments`/`tournament_groups` data model, a `draft → registration_open → registration_closed → ready → in_progress → completed`/`cancelled` lifecycle enforced in Postgres, admin create/edit screens, and a minimal public tournament page. No teams, matches, standings, or brackets yet (later phases).

**Architecture:** Same pattern as Phase 1: `SECURITY DEFINER` RPCs gated by `is_app_admin()`, string-status-code returns for mutations, every mutation logs to `admin_audit_log`. Frontend follows `admin/users.tsx`/`teams/create.tsx` shape (custom header, `TextField`/`Button`, filter chips, `Alert.alert` confirmations).

**Tech Stack:** Expo Router (React Native + react-native-web), Supabase (Postgres + RLS), TypeScript, i18n via `t()`. No JS test runner — SQL behavior verified with `do $$ ... $$` assertion scripts under `supabase/tests/`, run manually via the SQL editor. TypeScript verified with `npx tsc --noEmit`.

## Global Constraints

- Expo SDK 56 — check https://docs.expo.dev/versions/v56.0.0/ before using any Expo API not already used elsewhere in this codebase.
- Migrations are plain numbered `.sql` files in `supabase/migrations/`, applied manually via Supabase Dashboard → SQL Editor → Run, or `node scripts/run-supabase-sql.mjs <path>`. Every migration must be idempotent (`create table if not exists`, `create index if not exists`, `drop policy/trigger if exists` before `create`).
- **No date/time picker library exists in this app** — despite the design spec's Frontend section suggesting `@react-native-community/datetimepicker`, that package is not actually used anywhere in this codebase. Every existing event/date form (`src/components/create-event-screen.tsx`) uses plain `TextField`s for date (`YYYY-MM-DD`) and time (`HH:MM`) as text, parsed via `src/lib/datetime.ts`'s `toDateInput`/`toTimeInput`/`parseLocalDateTime`. This plan follows that exact established pattern instead of introducing a new dependency.
- All new RPCs follow the existing status-code-return convention (`'ok' | 'not_admin' | ...`), not thrown exceptions, for functions the client calls to perform an action. `is_app_admin()` (from migration `0008`) is the existing gate for "any admin" (true for `admin` or `super_admin` role, kept in sync via Phase 1's `admin_set_user_role`).
- **Deviation from the design spec:** the spec says `get_tournament_detail`/`list_tournaments` should "rely on RLS" for visibility filtering. That doesn't actually work in this codebase's convention — every existing read RPC (e.g. `events_for_field`, migration `0039`) is declared `security definer`, which runs as the migration's owning role (a Postgres superuser), and superusers bypass RLS entirely regardless of policies. So both functions below implement the same visibility rule (`status not in ('draft','cancelled') or is_app_admin()`) explicitly in their `where` clause, exactly like `events_for_field` does for its own visibility rules. The RLS policies on the tables are kept anyway as defense-in-depth against a direct `supabase.from('tournaments').select()` call bypassing the RPCs.
- All new/changed `.sql` functions: `revoke all ... from public; grant execute ... to authenticated;`, and the migration ends with `notify pgrst, 'reload schema';`.
- i18n's `t()` has no interpolation (`t(key: TKey): string` only) — never build a dynamic key path from a variable; use explicit if/else per literal key, matching `admin/users.tsx`'s `filterLabel`/`emptyLabel` pattern.
- Read `docs/superpowers/specs/2026-08-09-tournament-phase2-data-model-design.md` in full before starting; this plan implements it (with the RLS/security-definer and date-picker corrections above).

---

## Task 1: Migration 0071 — tournaments schema, RLS, storage bucket, and RPCs

**Files:**
- Create: `supabase/migrations/0071_tournaments.sql`

**Interfaces:**
- Produces (consumed by Task 3 and later phases):
  - Tables `public.tournaments`, `public.tournament_groups`
  - Storage bucket `tournament-logos`
  - `public.admin_create_tournament(p_name text, p_description text, p_logo_url text, p_sport text, p_event_date date, p_start_time time, p_end_time time, p_registration_opens_at timestamptz, p_registration_closes_at timestamptz, p_location_name text, p_address text, p_city text, p_latitude double precision, p_longitude double precision, p_contact_info text, p_max_teams integer, p_min_teams integer, p_players_per_team integer, p_substitutes_per_team integer, p_requires_approval boolean, p_points_win integer, p_points_draw integer, p_points_loss integer, p_allow_draws boolean, p_group_names text[]) returns table(status text, tournament_id uuid)`
  - `public.admin_update_tournament(p_tournament_id uuid, <same fields as create>, p_group_names text[]) returns text` — `'ok' | 'not_admin' | 'not_found' | 'invalid_input' | 'locked'`
  - `public.admin_set_tournament_status(p_tournament_id uuid, p_new_status text) returns text` — `'ok' | 'not_admin' | 'not_found' | 'invalid_transition'`
  - `public.get_tournament_detail(p_tournament_id uuid) returns table(id uuid, name text, description text, logo_url text, sport text, event_date date, start_time time, end_time time, registration_opens_at timestamptz, registration_closes_at timestamptz, location_name text, address text, city text, latitude double precision, longitude double precision, contact_info text, max_teams integer, min_teams integer, players_per_team integer, substitutes_per_team integer, requires_approval boolean, points_win integer, points_draw integer, points_loss integer, allow_draws boolean, status text, champion_team_id uuid, created_by uuid, created_at timestamptz, updated_at timestamptz, groups jsonb)`
  - `public.list_tournaments(p_status_filter text default null, p_admin_view boolean default false, p_limit integer default 50, p_offset integer default 0) returns table(id uuid, name text, logo_url text, sport text, event_date date, start_time time, end_time time, location_name text, city text, status text, max_teams integer, min_teams integer, created_at timestamptz, total_count bigint)`

- [ ] **Step 1: Write the migration file**

```sql
-- Migracja 0071: model danych turnieju (tournaments, tournament_groups),
-- bucket na logo, RPC tworzenia/edycji/zmiany statusu/odczytu.
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Tabela turniejów
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text,
  logo_url text,
  sport text not null default 'basketball'
    check (sport in ('basketball', 'football', 'volleyball', 'handball')),
  event_date date not null,
  start_time time not null,
  end_time time,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz not null,
  location_name text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  contact_info text,

  max_teams integer not null check (max_teams between 2 and 128),
  min_teams integer not null default 2 check (min_teams >= 2),
  players_per_team integer not null default 5 check (players_per_team between 1 and 30),
  substitutes_per_team integer not null default 0 check (substitutes_per_team between 0 and 15),
  requires_approval boolean not null default false,
  points_win integer not null default 3,
  points_draw integer not null default 1,
  points_loss integer not null default 0,
  allow_draws boolean not null default true,

  status text not null default 'draft' check (status in (
    'draft', 'registration_open', 'registration_closed',
    'ready', 'in_progress', 'completed', 'cancelled'
  )),
  champion_team_id uuid,

  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournaments_name_length check (char_length(trim(name)) between 3 and 100),
  constraint tournaments_min_le_max check (min_teams <= max_teams),
  constraint tournaments_registration_window check (
    registration_opens_at is null
    or registration_opens_at < registration_closes_at
  )
);

create index if not exists tournaments_status_idx on public.tournaments (status);
create index if not exists tournaments_event_date_idx on public.tournaments (event_date);

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at
  before update on public.tournaments
  for each row execute function public.set_updated_at();

-- 2) Grupy turniejowe (nazwy + kolejność; bez drużyn/tabeli — fazy 3-4)
create table if not exists public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,

  constraint tournament_groups_name_length check (char_length(trim(name)) between 1 and 40),
  constraint tournament_groups_unique_name unique (tournament_id, name)
);

create index if not exists tournament_groups_tournament_idx
  on public.tournament_groups (tournament_id);

-- 3) RLS: defense-in-depth przeciw bezpośrednim zapytaniom REST (poza RPC).
--    Draft/cancelled widoczne tylko dla adminów; reszta dla każdego zalogowanego.
alter table public.tournaments enable row level security;
alter table public.tournament_groups enable row level security;

drop policy if exists "Published tournaments are viewable by authenticated users"
  on public.tournaments;
create policy "Published tournaments are viewable by authenticated users"
  on public.tournaments for select
  to authenticated
  using (status not in ('draft', 'cancelled') or public.is_app_admin());

drop policy if exists "Groups follow their tournament's visibility"
  on public.tournament_groups;
create policy "Groups follow their tournament's visibility"
  on public.tournament_groups for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.status not in ('draft', 'cancelled') or public.is_app_admin())
    )
  );
-- Celowo brak insert/update/delete policy: wszystkie zapisy idą przez RPC poniżej.

-- 4) Bucket na logo turnieju (ten sam wzorzec co team-logos, migracja 0032)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-logos', 'tournament-logos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Admins upload tournament logos" on storage.objects;
create policy "Admins upload tournament logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-logos' and public.is_app_admin());

drop policy if exists "Admins update tournament logos" on storage.objects;
create policy "Admins update tournament logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'tournament-logos' and public.is_app_admin());

drop policy if exists "Public read tournament logos" on storage.objects;
create policy "Public read tournament logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'tournament-logos');

-- 5) Tworzenie turnieju (status startowy zawsze 'draft')
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

-- 6) Edycja turnieju (tylko draft/registration_open — inaczej 'locked')
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

-- 7) Zmiana statusu (jawna tabela przejść)
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

  update public.tournaments set status = p_new_status where id = p_tournament_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, 'set_tournament_status', 'tournament', p_tournament_id,
    jsonb_build_object('from', v_status, 'to', p_new_status));

  return 'ok';
end;
$$;

revoke all on function public.admin_set_tournament_status(uuid, text) from public;
grant execute on function public.admin_set_tournament_status(uuid, text) to authenticated;

-- 8) Odczyt szczegółu (jawny filtr widoczności — patrz Global Constraints)
create or replace function public.get_tournament_detail(p_tournament_id uuid)
returns table (
  id uuid, name text, description text, logo_url text, sport text,
  event_date date, start_time time, end_time time,
  registration_opens_at timestamptz, registration_closes_at timestamptz,
  location_name text, address text, city text,
  latitude double precision, longitude double precision, contact_info text,
  max_teams integer, min_teams integer, players_per_team integer,
  substitutes_per_team integer, requires_approval boolean,
  points_win integer, points_draw integer, points_loss integer, allow_draws boolean,
  status text, champion_team_id uuid, created_by uuid,
  created_at timestamptz, updated_at timestamptz, groups jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.name, t.description, t.logo_url, t.sport,
    t.event_date, t.start_time, t.end_time,
    t.registration_opens_at, t.registration_closes_at,
    t.location_name, t.address, t.city,
    t.latitude, t.longitude, t.contact_info,
    t.max_teams, t.min_teams, t.players_per_team,
    t.substitutes_per_team, t.requires_approval,
    t.points_win, t.points_draw, t.points_loss, t.allow_draws,
    t.status, t.champion_team_id, t.created_by,
    t.created_at, t.updated_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'sort_order', g.sort_order)
                         order by g.sort_order)
       from public.tournament_groups g where g.tournament_id = t.id),
      '[]'::jsonb
    ) as groups
  from public.tournaments t
  where t.id = p_tournament_id
    and (t.status not in ('draft', 'cancelled') or public.is_app_admin());
$$;

grant execute on function public.get_tournament_detail(uuid) to authenticated;

-- 9) Lista (admin_view=true wymaga is_app_admin(); false = tylko opublikowane)
create or replace function public.list_tournaments(
  p_status_filter text default null,
  p_admin_view boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, name text, logo_url text, sport text,
  event_date date, start_time time, end_time time,
  location_name text, city text, status text,
  max_teams integer, min_teams integer, created_at timestamptz,
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
    t.location_name, t.city, t.status,
    t.max_teams, t.min_teams, t.created_at,
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

grant execute on function public.list_tournaments(text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run `node scripts/run-supabase-sql.mjs supabase/migrations/0071_tournaments.sql` (approve the permission prompt), or paste the file into Supabase Dashboard → SQL Editor → Run. Confirm no errors.

- [ ] **Step 3: Sanity-check in the SQL editor**

Run: `select table_name from information_schema.tables where table_name in ('tournaments', 'tournament_groups');`
Expected: both rows present.

Run: `select proname from pg_proc where proname in ('admin_create_tournament', 'admin_update_tournament', 'admin_set_tournament_status', 'get_tournament_detail', 'list_tournaments');`
Expected: all five rows present.

Run: `select id from storage.buckets where id = 'tournament-logos';`
Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0071_tournaments.sql
git commit -m "Add tournament data model, lifecycle RPCs, and logo bucket"
```

---

## Task 2: SQL behavior test for the tournament RPCs

**Files:**
- Create: `supabase/tests/tournaments_test.sql`

**Interfaces:**
- Consumes: everything from Task 1. Requires at least one `admin` (or `super_admin`) profile and one plain `user` profile to exist.

- [ ] **Step 1: Write the test script**

```sql
-- ============================================================================
-- Turnieje — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil admin/super_admin i 1 profil user.
-- Pełne przejście = brak wyjątku; tabela _t na końcu zawiera zaliczone kroki.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_admin uuid; v_user uuid;
  v_status text; v_id uuid;
  v_group_count integer;
begin
  select id into v_admin from public.profiles where role in ('admin', 'super_admin') order by created_at limit 1;
  select id into v_user from public.profiles where role = 'user' order by created_at limit 1;
  if v_admin is null or v_user is null then
    raise exception 'Potrzebny co najmniej 1 profil admin/super_admin i 1 profil user';
  end if;

  -- 1) Zwykły user nie może utworzyć turnieju
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select status into v_status from public.admin_create_tournament(
    'Test Cup', null, null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'not_admin' then raise exception 'FAIL user cannot create, got %', v_status; end if;
  insert into _t values ('non-admin create blocked OK');

  -- 2) Admin tworzy turniej z 2 grupami
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_id from public.admin_create_tournament(
    'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    8, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  );
  if v_status <> 'ok' or v_id is null then raise exception 'FAIL admin create, got %', v_status; end if;
  select count(*) into v_group_count from public.tournament_groups where tournament_id = v_id;
  if v_group_count <> 2 then raise exception 'FAIL expected 2 groups, got %', v_group_count; end if;
  insert into _t values ('admin create + 2 groups OK');

  -- 3) Nowy turniej ma status draft
  select status into v_status from public.tournaments where id = v_id;
  if v_status <> 'draft' then raise exception 'FAIL new tournament not draft, got %', v_status; end if;
  insert into _t values ('new tournament is draft OK');

  -- 4) Admin edytuje draft (zmienia max_teams)
  select public.admin_update_tournament(
    v_id, 'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    16, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  ) into v_status;
  if v_status <> 'ok' then raise exception 'FAIL update draft, got %', v_status; end if;
  if (select max_teams from public.tournaments where id = v_id) <> 16 then
    raise exception 'FAIL max_teams not persisted';
  end if;
  insert into _t values ('update draft OK');

  -- 5) Przejście przez cały cykl życia
  select public.admin_set_tournament_status(v_id, 'registration_open') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL draft->registration_open, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'registration_closed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->registration_closed, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'ready') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->ready, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'in_progress') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->in_progress, got %', v_status; end if;
  select public.admin_set_tournament_status(v_id, 'completed') into v_status;
  if v_status <> 'ok' then raise exception 'FAIL ->completed, got %', v_status; end if;
  insert into _t values ('full lifecycle walk OK');

  -- 6) Nielegalne przejście z terminalnego stanu
  select public.admin_set_tournament_status(v_id, 'draft') into v_status;
  if v_status <> 'invalid_transition' then raise exception 'FAIL terminal state protected, got %', v_status; end if;
  insert into _t values ('illegal transition blocked OK');

  -- 7) Edycja zablokowana poza draft/registration_open ('locked')
  select public.admin_update_tournament(
    v_id, 'Test Cup', 'opis', null, 'basketball', current_date + 14, '10:00', null,
    null, now() + interval '7 days', null, null, null, null, null, null,
    16, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A', 'Grupa B']
  ) into v_status;
  if v_status <> 'locked' then raise exception 'FAIL completed tournament not locked, got %', v_status; end if;
  insert into _t values ('completed tournament locked OK');

  -- 8) Zwykły user widzi opublikowany (nie-draft/cancelled) turniej przez RPC odczytu
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.get_tournament_detail(v_id)) then
    raise exception 'FAIL non-admin cannot see completed tournament';
  end if;
  insert into _t values ('non-admin sees published tournament OK');

  -- 9) Zwykły user NIE widzi draftu przez RPC odczytu
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select status, tournament_id into v_status, v_id from public.admin_create_tournament(
    'Draft Cup', null, null, 'football', current_date + 21, '09:00', null,
    null, now() + interval '10 days', null, null, null, null, null, null,
    4, 2, 5, 0, false, 3, 1, 0, true, array['Grupa A']
  );
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if exists (select 1 from public.get_tournament_detail(v_id)) then
    raise exception 'FAIL non-admin can see draft tournament';
  end if;
  insert into _t values ('non-admin cannot see draft OK');

  -- 10) list_tournaments admin_view=true wymaga admina
  begin
    perform public.list_tournaments(null, true, 50, 0);
    raise exception 'FAIL admin_view should have raised for non-admin';
  exception when others then
    if sqlerrm <> 'not_admin' then raise exception 'FAIL wrong error for admin_view, got %', sqlerrm; end if;
  end;
  insert into _t values ('list_tournaments admin_view gated OK');

  raise notice 'Wszystkie testy turniejów zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
```

- [ ] **Step 2: Run it and verify**

Paste into the SQL editor of a dev/staging Supabase project and run. Expected: the final `select * from _t` returns 10 rows, no exception raised.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/tournaments_test.sql
git commit -m "Add SQL behavior test for tournament RPCs"
```

---

## Task 3: `src/lib/tournaments.ts` — types and RPC wrappers

**Files:**
- Create: `src/lib/tournaments.ts`

**Interfaces:**
- Consumes: the 5 RPCs from Task 1.
- Produces: `TournamentSport`, `TournamentStatus`, `TOURNAMENT_STATUSES`, `TOURNAMENT_STATUS_TRANSITIONS`, `TournamentGroup`, `Tournament`, `TournamentListItem`, `NewTournament`, `TournamentUpdate`, `createTournament`, `updateTournament`, `setTournamentStatus`, `getTournamentDetail`, `listTournaments` — consumed by Task 6 (form helpers) and Tasks 7-10 (screens).

- [ ] **Step 1: Write the file**

```ts
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
  return { status: status ?? 'error', tournamentId: null };
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
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/tournaments.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournaments.ts
git commit -m "Add tournaments RPC wrappers and types"
```

---

## Task 4: `src/lib/tournament-storage.ts` — logo upload

**Files:**
- Create: `src/lib/tournament-storage.ts`

**Interfaces:**
- Consumes: `extensionForMime`/`uploadImageToBucket` (`src/lib/storage-upload.ts`), `supabase` (`src/lib/supabase.ts`).
- Produces: `uploadTournamentLogo(tournamentId, uri, mimeType?, base64?) => { publicUrl: string | null; error: { message: string } | null }` — consumed by Tasks 8-9.

- [ ] **Step 1: Write the file**

```ts
import { extensionForMime, uploadImageToBucket } from '@/lib/storage-upload';
import { supabase } from '@/lib/supabase';

export async function uploadTournamentLogo(
  tournamentId: string,
  uri: string,
  mimeType = 'image/jpeg',
  base64?: string | null,
): Promise<{ publicUrl: string | null; error: { message: string } | null }> {
  const ext = extensionForMime(mimeType);
  const path = `${tournamentId}/logo-${Date.now()}.${ext}`;

  const { error } = await uploadImageToBucket('tournament-logos', path, { uri, mimeType, base64 });
  if (error) {
    return { publicUrl: null, error };
  }

  const { data } = supabase.storage.from('tournament-logos').getPublicUrl(path);
  return { publicUrl: data.publicUrl ?? null, error: null };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament-storage.ts
git commit -m "Add tournament logo upload helper"
```

---

## Task 5: i18n — tournament namespaces (en + pl)

**Files:**
- Modify: `src/i18n/en.ts:894-904` (the `admin` block), and insert new blocks right after the `adminUsers` block ends (currently `src/i18n/en.ts:1292-1316`, before `errors: {` at line 1317)
- Modify: `src/i18n/pl.ts:895-905` (the `admin` block), and insert new blocks right after the `adminUsers` block ends (currently `src/i18n/pl.ts:1299-1323`, before `errors: {` at line 1324)

**Interfaces:**
- Produces every `t('admin.tournaments*')`, `t('tournamentStatus.*')`, `t('adminTournaments.*')`, `t('tournamentForm.*')`, `t('tournamentDetail.*')` key used below — consumed by Tasks 6-10. Note this codebase's `t()` has no interpolation.

- [ ] **Step 1: `en.ts` — extend the `admin` block**

In `src/i18n/en.ts`, inside the `admin: { ... }` block, add two keys right after `usersHint`:

```ts
    tournamentsTitle: 'Tournaments',
    tournamentsHint: 'Create and manage official tournaments.',
```

- [ ] **Step 2: `en.ts` — add the new namespaces**

Right after the `adminUsers: { ... }` block closes (just before `errors: {`), insert:

```ts
  tournamentStatus: {
    draft: 'Draft',
    registrationOpen: 'Registration open',
    registrationClosed: 'Registration closed',
    ready: 'Ready',
    inProgress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  adminTournaments: {
    title: 'Tournaments',
    hint: 'Create and manage official tournaments.',
    filterAll: 'All',
    createLabel: 'Create tournament',
    empty: 'No tournaments yet.',
    loadError: 'Could not load tournaments.',
  },
  tournamentForm: {
    sectionBasic: 'Basic information',
    sectionConfig: 'Configuration',
    sectionGroups: 'Groups',
    name: 'Name',
    description: 'Description',
    sport: 'Sport',
    logoLabel: 'Logo',
    pickLogo: 'Choose logo',
    eventDate: 'Event date',
    eventDatePlaceholder: 'YYYY-MM-DD',
    startTime: 'Start time',
    endTime: 'End time (optional)',
    timePlaceholder: 'HH:MM',
    registrationOpens: 'Registration opens (optional)',
    registrationCloses: 'Registration closes',
    locationName: 'Venue name',
    address: 'Address',
    city: 'City',
    contactInfo: 'Contact info',
    maxTeams: 'Max teams',
    minTeams: 'Min teams',
    playersPerTeam: 'Players per team',
    substitutesPerTeam: 'Substitutes per team',
    requiresApproval: 'Requires approval to join',
    yes: 'Yes',
    no: 'No',
    pointsWin: 'Points for win',
    pointsDraw: 'Points for draw',
    pointsLoss: 'Points for loss',
    allowDraws: 'Allow draws',
    groups: 'Groups',
    groupPlaceholder: 'Group name',
    addGroup: '+ Add group',
    removeGroup: 'Remove',
    errName: 'Name must be 3-100 characters.',
    errSport: 'Choose a sport.',
    errDate: 'Enter a valid event date (YYYY-MM-DD).',
    errTime: 'Enter a valid time (HH:MM).',
    errRegistrationWindow: 'Registration must close after it opens, and a closing date is required.',
    errMaxTeams: 'Max teams must be between 2 and 128.',
    errMinTeams: 'Min teams must be at least 2 and no more than max teams.',
    errPlayersPerTeam: 'Players per team must be between 1 and 30.',
    errSubstitutes: 'Substitutes per team must be between 0 and 15.',
    errGroups: 'Add between 1 and 16 groups.',
    errGroupNames: 'Every group needs a name (1-40 characters).',
    errGroupDuplicate: 'Group names must be unique.',
    createTitle: 'New tournament',
    createAction: 'Create tournament',
    editTitle: 'Edit tournament',
    saveAction: 'Save changes',
    createError: 'Could not create the tournament. Try again.',
    saveError: 'Could not save changes. Try again.',
    lockedNotice: 'This tournament has started or finished — structure can no longer be edited.',
    statusTransitions: 'Change status',
    transitionOpenRegistration: 'Open registration',
    transitionCloseRegistration: 'Close registration',
    transitionReopenRegistration: 'Reopen registration',
    transitionMarkReady: 'Mark ready',
    transitionStart: 'Start tournament',
    transitionComplete: 'Complete tournament',
    transitionCancel: 'Cancel tournament',
    transitionConfirmTitle: 'Change tournament status?',
    transitionConfirmMessage: 'This will move the tournament to the next stage.',
    transitionError: 'Could not change the status. Try again.',
  },
  tournamentDetail: {
    notFound: 'Tournament not found.',
    loadError: 'Could not load this tournament.',
    registrationOpensLabel: 'Registration opens',
    registrationClosesLabel: 'Registration closes',
    locationLabel: 'Venue',
    addressLabel: 'Address',
    cityLabel: 'City',
    contactLabel: 'Contact',
    teamsRegistered: 'teams registered',
  },
```

- [ ] **Step 3: `pl.ts` — extend the `admin` block**

In `src/i18n/pl.ts`, inside the `admin: { ... }` block, add right after `usersHint`:

```ts
    tournamentsTitle: 'Turnieje',
    tournamentsHint: 'Twórz i zarządzaj oficjalnymi turniejami.',
```

- [ ] **Step 4: `pl.ts` — add the new namespaces**

Right after the `adminUsers: { ... }` block closes (just before `errors: {`), insert:

```ts
  tournamentStatus: {
    draft: 'Szkic',
    registrationOpen: 'Zapisy otwarte',
    registrationClosed: 'Zapisy zamknięte',
    ready: 'Gotowy',
    inProgress: 'W trakcie',
    completed: 'Zakończony',
    cancelled: 'Odwołany',
  },
  adminTournaments: {
    title: 'Turnieje',
    hint: 'Twórz i zarządzaj oficjalnymi turniejami.',
    filterAll: 'Wszystkie',
    createLabel: 'Utwórz turniej',
    empty: 'Brak turniejów.',
    loadError: 'Nie udało się wczytać turniejów.',
  },
  tournamentForm: {
    sectionBasic: 'Informacje podstawowe',
    sectionConfig: 'Konfiguracja',
    sectionGroups: 'Grupy',
    name: 'Nazwa',
    description: 'Opis',
    sport: 'Dyscyplina',
    logoLabel: 'Logo',
    pickLogo: 'Wybierz logo',
    eventDate: 'Data wydarzenia',
    eventDatePlaceholder: 'RRRR-MM-DD',
    startTime: 'Godzina rozpoczęcia',
    endTime: 'Godzina zakończenia (opcjonalnie)',
    timePlaceholder: 'GG:MM',
    registrationOpens: 'Otwarcie zapisów (opcjonalnie)',
    registrationCloses: 'Zamknięcie zapisów',
    locationName: 'Nazwa obiektu',
    address: 'Adres',
    city: 'Miasto',
    contactInfo: 'Dane kontaktowe',
    maxTeams: 'Maks. drużyn',
    minTeams: 'Min. drużyn',
    playersPerTeam: 'Zawodników w drużynie',
    substitutesPerTeam: 'Rezerwowych w drużynie',
    requiresApproval: 'Wymaga akceptacji zgłoszenia',
    yes: 'Tak',
    no: 'Nie',
    pointsWin: 'Punkty za wygraną',
    pointsDraw: 'Punkty za remis',
    pointsLoss: 'Punkty za porażkę',
    allowDraws: 'Dopuszczaj remisy',
    groups: 'Grupy',
    groupPlaceholder: 'Nazwa grupy',
    addGroup: '+ Dodaj grupę',
    removeGroup: 'Usuń',
    errName: 'Nazwa musi mieć 3-100 znaków.',
    errSport: 'Wybierz dyscyplinę.',
    errDate: 'Podaj prawidłową datę wydarzenia (RRRR-MM-DD).',
    errTime: 'Podaj prawidłową godzinę (GG:MM).',
    errRegistrationWindow: 'Zamknięcie zapisów musi być po otwarciu, a data zamknięcia jest wymagana.',
    errMaxTeams: 'Maks. drużyn musi być między 2 a 128.',
    errMinTeams: 'Min. drużyn musi być co najmniej 2 i nie więcej niż maks. drużyn.',
    errPlayersPerTeam: 'Zawodników w drużynie musi być między 1 a 30.',
    errSubstitutes: 'Rezerwowych w drużynie musi być między 0 a 15.',
    errGroups: 'Dodaj od 1 do 16 grup.',
    errGroupNames: 'Każda grupa potrzebuje nazwy (1-40 znaków).',
    errGroupDuplicate: 'Nazwy grup muszą być unikalne.',
    createTitle: 'Nowy turniej',
    createAction: 'Utwórz turniej',
    editTitle: 'Edytuj turniej',
    saveAction: 'Zapisz zmiany',
    createError: 'Nie udało się utworzyć turnieju. Spróbuj ponownie.',
    saveError: 'Nie udało się zapisać zmian. Spróbuj ponownie.',
    lockedNotice: 'Ten turniej się rozpoczął lub zakończył — struktury nie można już edytować.',
    statusTransitions: 'Zmień status',
    transitionOpenRegistration: 'Otwórz zapisy',
    transitionCloseRegistration: 'Zamknij zapisy',
    transitionReopenRegistration: 'Otwórz zapisy ponownie',
    transitionMarkReady: 'Oznacz jako gotowy',
    transitionStart: 'Rozpocznij turniej',
    transitionComplete: 'Zakończ turniej',
    transitionCancel: 'Odwołaj turniej',
    transitionConfirmTitle: 'Zmienić status turnieju?',
    transitionConfirmMessage: 'To przesunie turniej do następnego etapu.',
    transitionError: 'Nie udało się zmienić statusu. Spróbuj ponownie.',
  },
  tournamentDetail: {
    notFound: 'Nie znaleziono turnieju.',
    loadError: 'Nie udało się wczytać tego turnieju.',
    registrationOpensLabel: 'Otwarcie zapisów',
    registrationClosesLabel: 'Zamknięcie zapisów',
    locationLabel: 'Obiekt',
    addressLabel: 'Adres',
    cityLabel: 'Miasto',
    contactLabel: 'Kontakt',
    teamsRegistered: 'zapisanych drużyn',
  },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (`pl.ts` must have the keys for `TKey` to include them).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/pl.ts
git commit -m "Add tournament i18n namespaces"
```

---

## Task 6: `src/components/tournament-form.tsx` — shared form fields + helpers

**Files:**
- Create: `src/components/tournament-form.tsx`

**Interfaces:**
- Consumes: `TextField` (`src/components/text-field.tsx`), `TEAM_SPORTS`/`formatTeamSport` (`src/lib/sports.ts`), `parseLocalDateTime`/`toDateInput`/`toTimeInput` (`src/lib/datetime.ts`), `pickImageFromLibrary` (`src/lib/pick-image.ts`), `t` (`src/i18n`), `Tournament`/`TournamentSport`/`NewTournament` (Task 3).
- Produces: `TournamentFormValue`, `emptyTournamentFormValue()`, `tournamentToFormValue(t: Tournament)`, `validateTournamentForm(v): string | null`, `tournamentFormValueToInput(v): NewTournament`, `TournamentForm` component — consumed by Tasks 8-9.

- [ ] **Step 1: Write the file**

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Image } from 'react-native';

import { TextField } from '@/components/text-field';
import { Brand, Radius } from '@/constants/theme';
import { t } from '@/i18n';
import { parseLocalDateTime, toDateInput, toTimeInput } from '@/lib/datetime';
import { pickImageFromLibrary } from '@/lib/pick-image';
import { TEAM_SPORTS, formatTeamSport, type TeamSport } from '@/lib/sports';
import type { NewTournament, Tournament, TournamentSport } from '@/lib/tournaments';

export type TournamentFormValue = {
  name: string;
  description: string;
  sport: TournamentSport;
  logoUri: string | null;
  logoMime: string;
  logoBase64: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  regOpenDate: string;
  regOpenTime: string;
  regCloseDate: string;
  regCloseTime: string;
  locationName: string;
  address: string;
  city: string;
  contactInfo: string;
  maxTeams: string;
  minTeams: string;
  playersPerTeam: string;
  substitutesPerTeam: string;
  requiresApproval: boolean;
  pointsWin: string;
  pointsDraw: string;
  pointsLoss: string;
  allowDraws: boolean;
  groupNames: string[];
};

export function emptyTournamentFormValue(): TournamentFormValue {
  const now = new Date();
  return {
    name: '',
    description: '',
    sport: 'basketball',
    logoUri: null,
    logoMime: 'image/jpeg',
    logoBase64: null,
    eventDate: toDateInput(now),
    startTime: toTimeInput(now),
    endTime: '',
    regOpenDate: '',
    regOpenTime: '',
    regCloseDate: toDateInput(now),
    regCloseTime: toTimeInput(now),
    locationName: '',
    address: '',
    city: '',
    contactInfo: '',
    maxTeams: '8',
    minTeams: '2',
    playersPerTeam: '5',
    substitutesPerTeam: '0',
    requiresApproval: false,
    pointsWin: '3',
    pointsDraw: '1',
    pointsLoss: '0',
    allowDraws: true,
    groupNames: [''],
  };
}

function splitIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: toDateInput(d), time: toTimeInput(d) };
}

export function tournamentToFormValue(tournament: Tournament): TournamentFormValue {
  const opens = splitIso(tournament.registration_opens_at);
  const closes = splitIso(tournament.registration_closes_at);
  return {
    name: tournament.name,
    description: tournament.description ?? '',
    sport: tournament.sport,
    logoUri: tournament.logo_url,
    logoMime: 'image/jpeg',
    logoBase64: null,
    eventDate: tournament.event_date,
    startTime: tournament.start_time.slice(0, 5),
    endTime: tournament.end_time?.slice(0, 5) ?? '',
    regOpenDate: opens.date,
    regOpenTime: opens.time,
    regCloseDate: closes.date,
    regCloseTime: closes.time,
    locationName: tournament.location_name ?? '',
    address: tournament.address ?? '',
    city: tournament.city ?? '',
    contactInfo: tournament.contact_info ?? '',
    maxTeams: String(tournament.max_teams),
    minTeams: String(tournament.min_teams),
    playersPerTeam: String(tournament.players_per_team),
    substitutesPerTeam: String(tournament.substitutes_per_team),
    requiresApproval: tournament.requires_approval,
    pointsWin: String(tournament.points_win),
    pointsDraw: String(tournament.points_draw),
    pointsLoss: String(tournament.points_loss),
    allowDraws: tournament.allow_draws,
    groupNames: tournament.groups.length > 0 ? tournament.groups.map((g) => g.name) : [''],
  };
}

function toInt(raw: string): number {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

export function validateTournamentForm(v: TournamentFormValue): string | null {
  if (v.name.trim().length < 3 || v.name.trim().length > 100) return t('tournamentForm.errName');
  if (!(TEAM_SPORTS as readonly string[]).includes(v.sport)) return t('tournamentForm.errSport');
  if (!parseLocalDateTime(v.eventDate, v.startTime)) return t('tournamentForm.errDate');
  if (v.endTime.trim() && !parseLocalDateTime(v.eventDate, v.endTime)) return t('tournamentForm.errTime');

  if (!v.regCloseDate.trim() || !v.regCloseTime.trim()) return t('tournamentForm.errRegistrationWindow');
  const closesIso = parseLocalDateTime(v.regCloseDate, v.regCloseTime);
  if (!closesIso) return t('tournamentForm.errRegistrationWindow');

  let opensIso: string | null = null;
  if (v.regOpenDate.trim() || v.regOpenTime.trim()) {
    opensIso = parseLocalDateTime(v.regOpenDate, v.regOpenTime);
    if (!opensIso) return t('tournamentForm.errRegistrationWindow');
    if (opensIso >= closesIso) return t('tournamentForm.errRegistrationWindow');
  }

  const maxTeams = toInt(v.maxTeams);
  if (!Number.isFinite(maxTeams) || maxTeams < 2 || maxTeams > 128) return t('tournamentForm.errMaxTeams');
  const minTeams = toInt(v.minTeams);
  if (!Number.isFinite(minTeams) || minTeams < 2 || minTeams > maxTeams) return t('tournamentForm.errMinTeams');
  const playersPerTeam = toInt(v.playersPerTeam);
  if (!Number.isFinite(playersPerTeam) || playersPerTeam < 1 || playersPerTeam > 30)
    return t('tournamentForm.errPlayersPerTeam');
  const substitutes = toInt(v.substitutesPerTeam);
  if (!Number.isFinite(substitutes) || substitutes < 0 || substitutes > 15)
    return t('tournamentForm.errSubstitutes');

  const groups = v.groupNames.map((g) => g.trim()).filter(Boolean);
  if (groups.length < 1 || groups.length > 16) return t('tournamentForm.errGroups');
  if (groups.some((g) => g.length > 40)) return t('tournamentForm.errGroupNames');
  if (new Set(groups).size !== groups.length) return t('tournamentForm.errGroupDuplicate');

  return null;
}

export function tournamentFormValueToInput(v: TournamentFormValue): NewTournament {
  const startsAt = parseLocalDateTime(v.eventDate, v.startTime)!;
  const closesAt = parseLocalDateTime(v.regCloseDate, v.regCloseTime)!;
  const opensAt =
    v.regOpenDate.trim() || v.regOpenTime.trim()
      ? parseLocalDateTime(v.regOpenDate, v.regOpenTime)
      : null;

  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    logoUrl: v.logoUri,
    sport: v.sport,
    eventDate: v.eventDate.trim(),
    startTime: v.startTime.trim(),
    endTime: v.endTime.trim() || null,
    registrationOpensAt: opensAt,
    registrationClosesAt: closesAt,
    locationName: v.locationName.trim() || null,
    address: v.address.trim() || null,
    city: v.city.trim() || null,
    latitude: null,
    longitude: null,
    contactInfo: v.contactInfo.trim() || null,
    maxTeams: toInt(v.maxTeams),
    minTeams: toInt(v.minTeams),
    playersPerTeam: toInt(v.playersPerTeam),
    substitutesPerTeam: toInt(v.substitutesPerTeam),
    requiresApproval: v.requiresApproval,
    pointsWin: toInt(v.pointsWin),
    pointsDraw: toInt(v.pointsDraw),
    pointsLoss: toInt(v.pointsLoss),
    allowDraws: v.allowDraws,
    groupNames: v.groupNames.map((g) => g.trim()).filter(Boolean),
  };
}

type Props = {
  value: TournamentFormValue;
  onChange: (patch: Partial<TournamentFormValue>) => void;
  disabled?: boolean;
};

export function TournamentForm({ value, onChange, disabled }: Props) {
  const [busyLogo, setBusyLogo] = useState(false);

  async function pickLogo() {
    if (disabled) return;
    setBusyLogo(true);
    const picked = await pickImageFromLibrary();
    setBusyLogo(false);
    if (!picked) return;
    onChange({ logoUri: picked.uri, logoMime: picked.mimeType, logoBase64: picked.base64 ?? null });
  }

  function setGroup(index: number, name: string) {
    const next = [...value.groupNames];
    next[index] = name;
    onChange({ groupNames: next });
  }

  function addGroup() {
    if (value.groupNames.length >= 16) return;
    onChange({ groupNames: [...value.groupNames, ''] });
  }

  function removeGroup(index: number) {
    if (value.groupNames.length <= 1) return;
    onChange({ groupNames: value.groupNames.filter((_, i) => i !== index) });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionBasic')}</Text>

      <TextField
        label={t('tournamentForm.name')}
        value={value.name}
        onChangeText={(name) => onChange({ name })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.description')}
        value={value.description}
        onChangeText={(description) => onChange({ description })}
        editable={!disabled}
        multiline
      />

      <Text style={styles.label}>{t('tournamentForm.sport')}</Text>
      <View style={styles.chipsRow}>
        {(TEAM_SPORTS as readonly TeamSport[]).map((sport) => {
          const active = value.sport === sport;
          return (
            <Pressable
              key={sport}
              disabled={disabled}
              onPress={() => onChange({ sport })}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {formatTeamSport(sport)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('tournamentForm.logoLabel')}</Text>
      <View style={styles.logoRow}>
        {value.logoUri ? <Image source={{ uri: value.logoUri }} style={styles.logo} /> : null}
        <Pressable disabled={disabled || busyLogo} onPress={pickLogo} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>{t('tournamentForm.pickLogo')}</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.eventDate')}
          value={value.eventDate}
          onChangeText={(eventDate) => onChange({ eventDate })}
          placeholder={t('tournamentForm.eventDatePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.startTime')}
          value={value.startTime}
          onChangeText={(startTime) => onChange({ startTime })}
          placeholder={t('tournamentForm.timePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.endTime')}
          value={value.endTime}
          onChangeText={(endTime) => onChange({ endTime })}
          placeholder={t('tournamentForm.timePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
      </View>

      <Text style={styles.label}>{t('tournamentForm.registrationOpens')}</Text>
      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.eventDate')}
          value={value.regOpenDate}
          onChangeText={(regOpenDate) => onChange({ regOpenDate })}
          placeholder={t('tournamentForm.eventDatePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.startTime')}
          value={value.regOpenTime}
          onChangeText={(regOpenTime) => onChange({ regOpenTime })}
          placeholder={t('tournamentForm.timePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
      </View>

      <Text style={styles.label}>{t('tournamentForm.registrationCloses')}</Text>
      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.eventDate')}
          value={value.regCloseDate}
          onChangeText={(regCloseDate) => onChange({ regCloseDate })}
          placeholder={t('tournamentForm.eventDatePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.startTime')}
          value={value.regCloseTime}
          onChangeText={(regCloseTime) => onChange({ regCloseTime })}
          placeholder={t('tournamentForm.timePlaceholder')}
          editable={!disabled}
          style={styles.flex1}
        />
      </View>

      <TextField
        label={t('tournamentForm.locationName')}
        value={value.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.address')}
        value={value.address}
        onChangeText={(address) => onChange({ address })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.city')}
        value={value.city}
        onChangeText={(city) => onChange({ city })}
        editable={!disabled}
      />
      <TextField
        label={t('tournamentForm.contactInfo')}
        value={value.contactInfo}
        onChangeText={(contactInfo) => onChange({ contactInfo })}
        editable={!disabled}
      />

      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionConfig')}</Text>

      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.maxTeams')}
          value={value.maxTeams}
          onChangeText={(maxTeams) => onChange({ maxTeams })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.minTeams')}
          value={value.minTeams}
          onChangeText={(minTeams) => onChange({ minTeams })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
      </View>
      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.playersPerTeam')}
          value={value.playersPerTeam}
          onChangeText={(playersPerTeam) => onChange({ playersPerTeam })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.substitutesPerTeam')}
          value={value.substitutesPerTeam}
          onChangeText={(substitutesPerTeam) => onChange({ substitutesPerTeam })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
      </View>

      <ToggleRow
        label={t('tournamentForm.requiresApproval')}
        value={value.requiresApproval}
        onChange={(requiresApproval) => onChange({ requiresApproval })}
        disabled={disabled}
      />

      <View style={styles.row}>
        <TextField
          label={t('tournamentForm.pointsWin')}
          value={value.pointsWin}
          onChangeText={(pointsWin) => onChange({ pointsWin })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.pointsDraw')}
          value={value.pointsDraw}
          onChangeText={(pointsDraw) => onChange({ pointsDraw })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
        <TextField
          label={t('tournamentForm.pointsLoss')}
          value={value.pointsLoss}
          onChangeText={(pointsLoss) => onChange({ pointsLoss })}
          keyboardType="numeric"
          editable={!disabled}
          style={styles.flex1}
        />
      </View>

      <ToggleRow
        label={t('tournamentForm.allowDraws')}
        value={value.allowDraws}
        onChange={(allowDraws) => onChange({ allowDraws })}
        disabled={disabled}
      />

      <Text style={styles.sectionTitle}>{t('tournamentForm.sectionGroups')}</Text>
      {value.groupNames.map((name, index) => (
        <View key={index} style={styles.groupRow}>
          <TextInput
            style={styles.groupInput}
            value={name}
            onChangeText={(text) => setGroup(index, text)}
            placeholder={t('tournamentForm.groupPlaceholder')}
            placeholderTextColor={Brand.textMuted}
            editable={!disabled}
          />
          <Pressable
            disabled={disabled || value.groupNames.length <= 1}
            onPress={() => removeGroup(index)}
            style={styles.removeGroupBtn}>
            <Text style={styles.removeGroupText}>{t('tournamentForm.removeGroup')}</Text>
          </Pressable>
        </View>
      ))}
      <Pressable disabled={disabled} onPress={addGroup} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>{t('tournamentForm.addGroup')}</Text>
      </Pressable>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chipsRow}>
        <Pressable disabled={disabled} onPress={() => onChange(true)} style={[styles.chip, value && styles.chipActive]}>
          <Text style={[styles.chipText, value && styles.chipTextActive]}>{t('tournamentForm.yes')}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={() => onChange(false)} style={[styles.chip, !value && styles.chipActive]}>
          <Text style={[styles.chipText, !value && styles.chipTextActive]}>{t('tournamentForm.no')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.15,
    color: Brand.textSecondary,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  toggleRow: { gap: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  chipActive: { backgroundColor: Brand.primary, borderColor: Brand.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: Brand.textPrimary },
  chipTextActive: { color: Brand.primaryText },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 56, height: 56, borderRadius: Radius.md, backgroundColor: Brand.surface },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.borderStrong,
    backgroundColor: Brand.surface,
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: Brand.textPrimary },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupInput: {
    flex: 1,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: Brand.textPrimary,
  },
  removeGroupBtn: { paddingHorizontal: 10, paddingVertical: 10 },
  removeGroupText: { fontSize: 13, fontWeight: '600', color: Brand.danger },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament-form.tsx
git commit -m "Add shared tournament form component and helpers"
```

---

## Task 7: `/admin/tournaments` list screen

**Files:**
- Create: `src/app/(app)/admin/tournaments/index.tsx`

**Interfaces:**
- Consumes: `useUserRole` (`src/hooks/use-user-role.ts`), `listTournaments`/`TournamentListItem`/`TournamentStatus`/`TOURNAMENT_STATUSES` (Task 3), `ScreenHeader` (`src/components/screen-header.tsx`), `t('adminTournaments.*')`/`t('tournamentStatus.*')` (Task 5).
- Produces: route `/admin/tournaments`, linked from Task 10.

- [ ] **Step 1: Write the screen**

```tsx
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Brand } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { formatTeamSport } from '@/lib/sports';
import {
  TOURNAMENT_STATUSES,
  listTournaments,
  type TournamentListItem,
  type TournamentStatus,
} from '@/lib/tournaments';
import { goBack } from '@/lib/navigation';

function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

export default function AdminTournamentsScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [filter, setFilter] = useState<TournamentStatus | null>(null);
  const [items, setItems] = useState<TournamentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await listTournaments(filter, true, 100, 0);
    setItems(data);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [filter, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) void load();
    }, [isAdmin, load]),
  );

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
        <ScreenHeader insetTop={insets.top} title={t('adminTournaments.title')} onBack={() => goBack('/admin')} />
        <Text style={styles.muted}>{t('admin.notAuthorized')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('adminTournaments.title')}
        onBack={() => goBack('/admin')}
        rightActions={[
          {
            key: 'create',
            icon: '+',
            primary: true,
            accessibilityLabel: t('adminTournaments.createLabel'),
            onPress: () => router.push('/admin/tournaments/create'),
          },
        ]}
      />

      <View style={styles.filtersRow}>
        <Pressable
          onPress={() => setFilter(null)}
          style={[styles.filterChip, filter === null && styles.filterChipActive]}>
          <Text style={[styles.filterChipText, filter === null && styles.filterChipTextActive]}>
            {t('adminTournaments.filterAll')}
          </Text>
        </Pressable>
        {TOURNAMENT_STATUSES.map((status) => {
          const active = filter === status;
          return (
            <Pressable
              key={status}
              onPress={() => setFilter(status)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {statusLabel(status)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminTournaments.loadError')}</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>{t('adminTournaments.empty')}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/admin/tournaments/[id]/edit', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatTeamSport(item.sport)} · {item.event_date}
                </Text>
              </View>
              <Text style={styles.statusBadge}>{statusLabel(item.status)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  pressed: { opacity: 0.85 },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Brand.primary },
  rowMeta: { fontSize: 13, color: Brand.textSecondary },
  statusBadge: { fontSize: 12, fontWeight: '600', color: Brand.textMuted },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (except possibly the typed-routes false positive for `/admin/tournaments/[id]/edit` and `/admin/tournaments/create` — see Task 12's note; ignore until then).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/tournaments/index.tsx"
git commit -m "Add admin tournaments list screen"
```

---

## Task 8: `/admin/tournaments/create` screen

**Files:**
- Create: `src/app/(app)/admin/tournaments/create.tsx`

**Interfaces:**
- Consumes: `TournamentForm`/`emptyTournamentFormValue`/`validateTournamentForm`/`tournamentFormValueToInput` (Task 6), `createTournament`/`updateTournament` (Task 3), `uploadTournamentLogo` (Task 4).
- Produces: route `/admin/tournaments/create`, linked from Task 7.

- [ ] **Step 1: Write the screen**

```tsx
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import {
  TournamentForm,
  emptyTournamentFormValue,
  tournamentFormValueToInput,
  validateTournamentForm,
} from '@/components/tournament-form';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { createTournament, updateTournament } from '@/lib/tournaments';
import { uploadTournamentLogo } from '@/lib/tournament-storage';

export default function CreateTournamentScreen() {
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(emptyTournamentFormValue());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(patch: Partial<typeof value>) {
    setValue((prev) => ({ ...prev, ...patch }));
  }

  async function handleCreate() {
    const validationError = validateTournamentForm(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    const input = tournamentFormValueToInput(value);
    const result = await createTournament(input);

    if (result.status !== 'ok') {
      setError(t('tournamentForm.createError'));
      setBusy(false);
      return;
    }

    if (value.logoUri && value.logoBase64) {
      const { publicUrl } = await uploadTournamentLogo(
        result.tournamentId,
        value.logoUri,
        value.logoMime,
        value.logoBase64,
      );
      if (publicUrl) {
        await updateTournament(result.tournamentId, { ...input, logoUrl: publicUrl });
      }
    }

    setBusy(false);
    router.replace({
      pathname: '/admin/tournaments/[id]/edit',
      params: { id: result.tournamentId },
    } as Href);
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('tournamentForm.createTitle')}
        onBack={() => goBack('/admin/tournaments' as Href)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <TournamentForm value={value} onChange={onChange} disabled={busy} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label={t('tournamentForm.createAction')} onPress={handleCreate} disabled={busy} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  errorText: { fontSize: 14, color: Brand.danger, marginTop: 12 },
  submit: { marginTop: 20 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (typed-routes caveat as in Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/tournaments/create.tsx"
git commit -m "Add tournament create screen"
```

---

## Task 9: `/admin/tournaments/[id]/edit` screen

**Files:**
- Create: `src/app/(app)/admin/tournaments/[id]/edit.tsx`

**Interfaces:**
- Consumes: `TournamentForm`/`tournamentToFormValue`/`validateTournamentForm`/`tournamentFormValueToInput` (Task 6), `getTournamentDetail`/`updateTournament`/`setTournamentStatus`/`TOURNAMENT_STATUS_TRANSITIONS`/`Tournament`/`TournamentStatus` (Task 3), `uploadTournamentLogo` (Task 4).
- Produces: route `/admin/tournaments/[id]/edit`.

- [ ] **Step 1: Write the screen**

```tsx
import { useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import {
  TournamentForm,
  tournamentFormValueToInput,
  tournamentToFormValue,
  validateTournamentForm,
  type TournamentFormValue,
} from '@/components/tournament-form';
import { Brand } from '@/constants/theme';
import { t } from '@/i18n';
import { goBack } from '@/lib/navigation';
import { uploadTournamentLogo } from '@/lib/tournament-storage';
import {
  TOURNAMENT_STATUS_TRANSITIONS,
  getTournamentDetail,
  setTournamentStatus,
  updateTournament,
  type Tournament,
  type TournamentStatus,
} from '@/lib/tournaments';

function transitionLabel(current: TournamentStatus, target: TournamentStatus): string {
  if (target === 'registration_open') {
    return current === 'registration_closed'
      ? t('tournamentForm.transitionReopenRegistration')
      : t('tournamentForm.transitionOpenRegistration');
  }
  switch (target) {
    case 'registration_closed': return t('tournamentForm.transitionCloseRegistration');
    case 'ready': return t('tournamentForm.transitionMarkReady');
    case 'in_progress': return t('tournamentForm.transitionStart');
    case 'completed': return t('tournamentForm.transitionComplete');
    case 'cancelled': return t('tournamentForm.transitionCancel');
    default: return t('tournamentForm.transitionOpenRegistration');
  }
}

export default function EditTournamentScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const tournamentId = params.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [value, setValue] = useState<TournamentFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    const { data } = await getTournamentDetail(tournamentId);
    if (data) {
      setTournament(data);
      setValue(tournamentToFormValue(data));
    }
    setLoading(false);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function onChange(patch: Partial<TournamentFormValue>) {
    setValue((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  const editable = tournament?.status === 'draft' || tournament?.status === 'registration_open';

  async function handleSave() {
    if (!tournamentId || !value || !editable) return;
    const validationError = validateTournamentForm(value);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError(null);

    const input = tournamentFormValueToInput(value);
    let logoUrl = input.logoUrl;
    if (value.logoBase64 && value.logoUri) {
      const { publicUrl } = await uploadTournamentLogo(tournamentId, value.logoUri, value.logoMime, value.logoBase64);
      if (publicUrl) logoUrl = publicUrl;
    }

    const result = await updateTournament(tournamentId, { ...input, logoUrl });
    setBusy(false);

    if (result !== 'ok') {
      setError(t('tournamentForm.saveError'));
      return;
    }
    void load();
  }

  function confirmTransition(target: TournamentStatus) {
    const label = transitionLabel(tournament?.status ?? 'draft', target);
    Alert.alert(t('tournamentForm.transitionConfirmTitle'), t('tournamentForm.transitionConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: label, onPress: () => void handleTransition(target) },
    ]);
  }

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

  if (loading || !value) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  const legalTransitions = tournament ? TOURNAMENT_STATUS_TRANSITIONS[tournament.status] : [];

  return (
    <View style={styles.flex}>
      <ScreenHeader
        insetTop={insets.top}
        title={t('tournamentForm.editTitle')}
        onBack={() => goBack('/admin/tournaments' as Href)}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {!editable ? <Text style={styles.notice}>{t('tournamentForm.lockedNotice')}</Text> : null}

          <TournamentForm value={value} onChange={onChange} disabled={busy || !editable} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {editable ? (
            <Button label={t('tournamentForm.saveAction')} onPress={handleSave} disabled={busy} style={styles.submit} />
          ) : null}

          {legalTransitions.length > 0 ? (
            <View style={styles.transitions}>
              <Text style={styles.sectionTitle}>{t('tournamentForm.statusTransitions')}</Text>
              {legalTransitions.map((target) => (
                <Button
                  key={target}
                  label={transitionLabel(tournament?.status ?? 'draft', target)}
                  variant={target === 'cancelled' ? 'danger' : 'secondary'}
                  onPress={() => confirmTransition(target)}
                  disabled={busy}
                  style={styles.transitionBtn}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  notice: {
    fontSize: 14,
    color: Brand.textSecondary,
    backgroundColor: Brand.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 14, color: Brand.danger, marginTop: 12 },
  submit: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Brand.textPrimary, marginBottom: 8 },
  transitions: { marginTop: 28, gap: 10 },
  transitionBtn: { marginTop: 0 },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (typed-routes caveat as in Task 7).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/tournaments/[id]/edit.tsx"
git commit -m "Add tournament edit screen with status transitions"
```

---

## Task 10: `/tournament/[id]` public detail page

**Files:**
- Create: `src/app/(app)/tournament/[id].tsx`

**Interfaces:**
- Consumes: `getTournamentDetail` (Task 3), `t('tournamentDetail.*')`/`t('tournamentStatus.*')` (Task 5).

- [ ] **Step 1: Write the screen**

```tsx
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

function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

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

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (notFound || !tournament) {
    return (
      <View style={styles.flex}>
        <ScreenHeader insetTop={insets.top} onBack={() => goBack('/' as Href)} />
        <Text style={styles.muted}>{t('tournamentDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader insetTop={insets.top} title={tournament.name} onBack={() => goBack('/' as Href)} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headerRow}>
          {tournament.logo_url ? <Image source={{ uri: tournament.logo_url }} style={styles.logo} /> : null}
          <View style={styles.headerText}>
            <Text style={styles.sportBadge}>{formatTeamSport(tournament.sport)}</Text>
            <Text style={styles.statusBadge}>{statusLabel(tournament.status)}</Text>
          </View>
        </View>

        {tournament.description ? <Text style={styles.description}>{tournament.description}</Text> : null}

        <View style={styles.infoBlock}>
          <Text style={styles.infoLine}>
            {tournament.event_date} · {tournament.start_time.slice(0, 5)}
            {tournament.end_time ? `–${tournament.end_time.slice(0, 5)}` : ''}
          </Text>
          {tournament.location_name ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.locationLabel')}: {tournament.location_name}</Text>
          ) : null}
          {tournament.address ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.addressLabel')}: {tournament.address}</Text>
          ) : null}
          {tournament.city ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.cityLabel')}: {tournament.city}</Text>
          ) : null}
          {tournament.contact_info ? (
            <Text style={styles.infoLine}>{t('tournamentDetail.contactLabel')}: {tournament.contact_info}</Text>
          ) : null}
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Brand.screenBackground },
  loader: { marginTop: 32 },
  muted: { fontSize: 15, color: Brand.textMuted, marginTop: 24, paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 64, height: 64, borderRadius: Radius.md, backgroundColor: Brand.surface },
  headerText: { gap: 6 },
  sportBadge: { fontSize: 13, fontWeight: '600', color: Brand.textSecondary },
  statusBadge: { fontSize: 13, fontWeight: '700', color: Brand.primary },
  description: { fontSize: 14, color: Brand.textPrimary, marginBottom: 16, lineHeight: 20 },
  infoBlock: { gap: 8 },
  infoLine: { fontSize: 14, color: Brand.textSecondary },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/tournament/[id].tsx"
git commit -m "Add public tournament detail page"
```

---

## Task 11: Wire `/admin/tournaments` into the admin hub

**Files:**
- Modify: `src/app/(app)/admin/index.tsx` (already updated in Phase 1 to use `useUserRole`/`buildAdminTools`, ~152 lines)

**Interfaces:**
- Consumes: route `/admin/tournaments` (Task 7).

- [ ] **Step 1: Extend the `AdminTool` path union and tool list**

In `src/app/(app)/admin/index.tsx`, change the `path` union:

```ts
  path: '/admin/fields' | '/admin/reports' | '/admin/users' | '/admin/tournaments';
```

Inside `buildAdminTools`, add a `tournaments` entry to the base `tools` array (visible to any admin, not gated behind `isSuperAdmin` — unlike `users`):

```ts
  const tools: AdminTool[] = [
    {
      key: 'fields',
      title: t('admin.fieldsTitle'),
      hint: t('admin.fieldsHint'),
      path: '/admin/fields',
    },
    {
      key: 'reports',
      title: t('admin.reportsTitle'),
      hint: t('admin.reportsHint'),
      path: '/admin/reports',
    },
    {
      key: 'tournaments',
      title: t('admin.tournamentsTitle'),
      hint: t('admin.tournamentsHint'),
      path: '/admin/tournaments',
    },
  ];
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/index.tsx"
git commit -m "Add Tournaments tile to admin hub"
```

---

## Task 12: Regenerate typed routes, resolve tsc baseline, and end-to-end verification

**Files:** none created — this task clears the typed-routes false positives introduced by Tasks 7-10's new route files and walks the design spec's testing checklist.

**Interfaces:**
- Consumes: everything from Tasks 1-11.

- [ ] **Step 1: Regenerate Expo Router's typed-routes cache**

New route files (`admin/tournaments/index.tsx`, `admin/tournaments/create.tsx`, `admin/tournaments/[id]/edit.tsx`, `tournament/[id].tsx`) mean `.expo/types/router.d.ts` (gitignored, per-machine) is stale and `tsc` will show spurious `Type '"/admin/tournaments"' is not assignable to ...` errors. Run:

```bash
npx tsc --noEmit > baseline-before.txt
timeout 40 npx expo start --web --non-interactive
npx tsc --noEmit > baseline-after.txt
```

Diff `baseline-after.txt` against `baseline-before.txt` (or against a known pre-Phase-2 baseline). Expected: zero errors originating in any file this plan created or touched; only the repo's existing ~15-17 pre-existing unrelated errors (map/CSS imports) remain.

- [ ] **Step 2: Create → edit → lifecycle round-trip in the UI**

As an admin, open `/admin`, tap "Tournaments", tap "+", fill in the form (name, sport, event date/time, registration window, max/min teams, 3 groups), submit. Confirm it navigates to the edit screen for the new tournament, status shows "Draft". Edit `max_teams`, save, confirm it persists after a reload. Walk the status buttons: Open registration → Close registration → Mark ready → Start tournament → Complete tournament, confirming each transition updates the shown status and an illegal jump is not offered (buttons always match `TOURNAMENT_STATUS_TRANSITIONS`).

- [ ] **Step 3: Lock and visibility checks**

Once "Completed", confirm the edit screen shows the locked notice and no editable form fields (status transition buttons should also be empty since `completed` is terminal). As a signed-in non-admin user, confirm `/admin/tournaments` is not reachable (no tile on `/admin`) and navigate directly to `/tournament/[id]` for the completed tournament — confirm it loads (published, visible). Create a second tournament and leave it in `draft`; as the non-admin user, navigate to its `/tournament/[id]` URL directly — confirm `tournamentDetail.notFound` is shown (RLS/RPC filter hides it).

- [ ] **Step 4: Audit log check**

In the SQL editor, run `select * from public.admin_list_audit_log('tournament', 20);` and confirm `create_tournament`, `update_tournament`, and one `set_tournament_status` row per transition performed in Step 2 are present.

- [ ] **Step 5: Confirm Phase 1 features still work**

Open `/admin/users` and `/admin/reports` as the same admin account and confirm both still function — proving nothing in this phase's admin hub change regressed Phase 1.

No commit for this task — it's verification only. If any step fails, return to the relevant earlier task, fix, and re-run this checklist from the affected step onward.
