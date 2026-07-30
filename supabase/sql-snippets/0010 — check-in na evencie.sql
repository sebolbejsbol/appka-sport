-- ═══════════════════════════════════════════════════════════════════════════
-- 0010 — Check-in GPS na evencie
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007
-- Plik: supabase/migrations/0010_event_check_ins.sql
-- SQL Editor: 0010 — check-in na evencie
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

create table if not exists public.event_check_ins (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('gps', 'manual')),
  is_late boolean not null default false,
  primary key (event_id, user_id)
);

comment on table public.event_check_ins is 'Meldunki uczestników eventu (GPS lub ręcznie przez organizatora).';

create index if not exists event_check_ins_user_idx on public.event_check_ins (user_id);

alter table public.event_check_ins enable row level security;

-- Uczestnicy tego samego eventu widzą meldunki (lista graczy).
drop policy if exists "Event participants can view check-ins" on public.event_check_ins;
create policy "Event participants can view check-ins"
  on public.event_check_ins for select
  to authenticated
  using (
    exists (
      select 1 from public.event_participants ep
      where ep.event_id = event_check_ins.event_id
        and ep.user_id = auth.uid()
    )
    or public.is_app_admin()
  );

-- Zapis tylko przez RPC (security definer) — brak polityki insert/update/delete dla użytkowników.

-- Helper: granice okna meldowania
create or replace function public.event_check_in_bounds(
  p_starts_at timestamptz,
  p_duration_min integer
)
returns table (
  opens_at timestamptz,
  closes_at timestamptz
)
language sql
immutable
as $$
  select
    p_starts_at - interval '20 minutes' as opens_at,
    p_starts_at + (p_duration_min || ' minutes')::interval as closes_at;
$$;

-- RPC: meldowanie GPS (sam siebie, w oknie, w promieniu 100 m)
create or replace function public.check_in_event(
  p_event_id uuid,
  p_lng double precision,
  p_lat double precision
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts timestamptz;
  v_duration integer;
  v_status text;
  v_distance double precision;
  v_opens timestamptz;
  v_closes timestamptz;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  if p_lng is null or p_lat is null or not (p_lng between -180 and 180 and p_lat between -90 and 90) then
    return 'no_location';
  end if;

  select
    e.starts_at,
    e.duration_min,
    e.status,
    st_distance(
      f.geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
    )
  into v_starts, v_duration, v_status, v_distance
  from public.events e
  inner join public.fields f on f.id = e.field_id
  where e.id = p_event_id;

  if not found then
    return 'event_not_found';
  end if;

  if v_status <> 'planned' then
    return 'event_closed';
  end if;

  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id and ep.user_id = auth.uid()
  ) then
    return 'not_participant';
  end if;

  if exists (
    select 1 from public.event_check_ins ci
    where ci.event_id = p_event_id and ci.user_id = auth.uid()
  ) then
    return 'already_checked_in';
  end if;

  select b.opens_at, b.closes_at
  into v_opens, v_closes
  from public.event_check_in_bounds(v_starts, v_duration) b;

  if now() < v_opens then
    return 'not_in_window';
  end if;

  if now() > v_closes then
    return 'window_closed';
  end if;

  if v_distance > 100 then
    return 'too_far';
  end if;

  insert into public.event_check_ins (event_id, user_id, method, is_late)
  values (
    p_event_id,
    auth.uid(),
    'gps',
    now() > v_starts
  );

  return 'checked_in';
end;
$$;

grant execute on function public.check_in_event(uuid, double precision, double precision) to authenticated;

-- RPC: meldowanie ręczne (organizator/admin, po zamknięciu okna)
create or replace function public.manual_check_in_event(
  p_event_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_starts timestamptz;
  v_duration integer;
  v_status text;
  v_creator uuid;
  v_closes timestamptz;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  select e.starts_at, e.duration_min, e.status, e.creator_id
  into v_starts, v_duration, v_status, v_creator
  from public.events e
  where e.id = p_event_id;

  if not found then
    return 'event_not_found';
  end if;

  if v_status <> 'planned' then
    return 'event_closed';
  end if;

  if auth.uid() <> v_creator and not public.is_app_admin() then
    return 'not_organizer';
  end if;

  if not exists (
    select 1 from public.event_participants ep
    where ep.event_id = p_event_id and ep.user_id = p_user_id
  ) then
    return 'not_participant';
  end if;

  if exists (
    select 1 from public.event_check_ins ci
    where ci.event_id = p_event_id and ci.user_id = p_user_id
  ) then
    return 'already_checked_in';
  end if;

  select b.closes_at into v_closes
  from public.event_check_in_bounds(v_starts, v_duration) b;

  if now() <= v_closes then
    return 'window_still_open';
  end if;

  insert into public.event_check_ins (event_id, user_id, method, is_late)
  values (
    p_event_id,
    p_user_id,
    'manual',
    now() > v_starts
  );

  return 'checked_in';
end;
$$;

grant execute on function public.manual_check_in_event(uuid, uuid) to authenticated;

-- Rozszerzone szczegóły eventu (meldowanie + współrzędne boiska)
create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
as $$
  with bounds as (
    select
      e.id as event_id,
      b.opens_at,
      b.closes_at
    from public.events e
    cross join lateral public.event_check_in_bounds(e.starts_at, e.duration_min) b
    where e.id = p_event_id
  )
  select json_build_object(
    'id', e.id,
    'field_id', e.field_id,
    'field_name', f.name,
    'field_lng', st_x(f.geom::geometry),
    'field_lat', st_y(f.geom::geometry),
    'title', e.title,
    'notes', e.notes,
    'starts_at', e.starts_at,
    'duration_min', e.duration_min,
    'max_players', e.max_players,
    'status', e.status,
    'sport', e.sport,
    'creator_id', e.creator_id,
    'creator_nick', cp.nick,
    'participant_count', (
      select count(*) from public.event_participants ep where ep.event_id = e.id
    ),
    'is_joined', exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ),
    'can_manage', (e.creator_id = auth.uid() or public.is_app_admin()),
    'is_admin_view', public.is_app_admin(),
    'check_in_opens_at', bd.opens_at,
    'check_in_closes_at', bd.closes_at,
    'check_in_window', case
      when now() < bd.opens_at then 'not_yet'
      when now() > bd.closes_at then 'closed'
      else 'open'
    end,
    'my_check_in', (
      select json_build_object(
        'checked_in_at', ci.checked_in_at,
        'method', ci.method,
        'is_late', ci.is_late
      )
      from public.event_check_ins ci
      where ci.event_id = e.id and ci.user_id = auth.uid()
    ),
    'participants', coalesce((
      select json_agg(
        json_build_object(
          'user_id', ep.user_id,
          'nick', pp.nick,
          'joined_at', ep.joined_at,
          'checked_in_at', ci.checked_in_at,
          'check_in_method', ci.method,
          'is_late', ci.is_late
        )
        order by ep.joined_at asc
      )
      from public.event_participants ep
      left join public.profiles pp on pp.id = ep.user_id
      left join public.event_check_ins ci
        on ci.event_id = ep.event_id and ci.user_id = ep.user_id
      where ep.event_id = e.id
    ), '[]'::json)
  )
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  left join bounds bd on bd.event_id = e.id
  where e.id = p_event_id;
$$;

grant execute on function public.event_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
