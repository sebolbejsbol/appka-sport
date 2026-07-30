-- Migracja 0024: pola eventów pod zaawansowane filtrowanie
-- Uruchom w Supabase: SQL Editor → Run.

alter table public.events
  add column if not exists skill_level text not null default 'any',
  add column if not exists event_type text not null default 'match',
  add column if not exists payment_status text not null default 'free';

alter table public.events
  drop constraint if exists events_skill_level_check;

alter table public.events
  add constraint events_skill_level_check
  check (skill_level in ('any', 'beginner', 'intermediate', 'advanced'));

alter table public.events
  drop constraint if exists events_event_type_check;

alter table public.events
  add constraint events_event_type_check
  check (event_type in ('match', 'training', 'tournament', 'sparring', 'looking_for_players'));

alter table public.events
  drop constraint if exists events_payment_status_check;

alter table public.events
  add constraint events_payment_status_check
  check (payment_status in ('free', 'paid'));

comment on column public.events.skill_level is 'Poziom: any = każdy, beginner/intermediate/advanced.';
comment on column public.events.event_type is 'Typ: match, training, tournament, sparring, looking_for_players.';
comment on column public.events.payment_status is 'free lub paid.';

-- Nadchodzące eventy (dla listy i filtrowania po stronie apki)
drop function if exists public.upcoming_events(text, integer);

create or replace function public.upcoming_events(
  p_filter text default 'all',
  p_max_rows integer default 200
)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
  skill_level text,
  event_type text,
  payment_status text,
  field_id uuid,
  field_name text,
  field_lng double precision,
  field_lat double precision,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  is_joined boolean,
  is_mine boolean
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    e.skill_level,
    e.event_type,
    e.payment_status,
    e.field_id,
    f.name as field_name,
    st_x(f.geom::geometry) as field_lng,
    st_y(f.geom::geometry) as field_lat,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined,
    (e.creator_id = auth.uid()) as is_mine
  from public.events e
  inner join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and f.status = 'approved'
    and public.field_matches_sport_filter(f.sport, 'basketball')
    and (
      coalesce(p_filter, 'all') = 'all'
      or (
        p_filter = 'mine'
        and (
          e.creator_id = auth.uid()
          or exists (
            select 1 from public.event_participants epm
            where epm.event_id = e.id and epm.user_id = auth.uid()
          )
        )
      )
      or (
        p_filter = 'spots'
        and (
          e.max_players is null
          or (
            select count(*) from public.event_participants eps
            where eps.event_id = e.id
          ) < e.max_players
        )
      )
    )
  order by e.starts_at asc
  limit least(greatest(coalesce(p_max_rows, 200), 1), 300);
$$;

grant execute on function public.upcoming_events(text, integer) to authenticated;

-- Eventy na boisku (sheet)
drop function if exists public.events_for_field(uuid);

create or replace function public.events_for_field(p_field_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
  skill_level text,
  event_type text,
  payment_status text,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  is_joined boolean
)
language sql
stable
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    e.skill_level,
    e.event_type,
    e.payment_status,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined
  from public.events e
  left join public.profiles cp on cp.id = e.creator_id
  where e.field_id = p_field_id
    and e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
  order by e.starts_at asc;
$$;

grant execute on function public.events_for_field(uuid) to authenticated;

notify pgrst, 'reload schema';
