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
