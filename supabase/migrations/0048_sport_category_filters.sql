-- ═══════════════════════════════════════════════════════════════════════════
-- 0048 — Kategoria sportowa w filtrach (mapa + eventy)
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.event_counts_in_bbox(double precision, double precision, double precision, double precision);

create or replace function public.event_counts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport_filter text default 'basketball'
)
returns table (
  field_id uuid,
  event_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.field_id,
    count(*)::bigint as event_count
  from public.events e
  inner join public.fields f on f.id = e.field_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and f.status = 'approved'
    and public.field_matches_sport_filter(f.sport, sport_filter)
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  group by e.field_id;
$$;

grant execute on function public.event_counts_in_bbox(
  double precision, double precision, double precision, double precision, text
) to authenticated;

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
  sport text,
  skill_level text,
  event_type text,
  payment_status text,
  visibility text,
  field_id uuid,
  field_name text,
  field_lng double precision,
  field_lat double precision,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  waitlist_count bigint,
  is_joined boolean,
  is_waitlisted boolean,
  is_mine boolean,
  has_blocked_co_player boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    coalesce(e.sport, 'basketball') as sport,
    coalesce(e.skill_level, 'any') as skill_level,
    coalesce(e.event_type, 'match') as event_type,
    coalesce(e.payment_status, 'free') as payment_status,
    coalesce(e.visibility, 'public') as visibility,
    e.field_id,
    f.name as field_name,
    st_x(f.geom::geometry) as field_lng,
    st_y(f.geom::geometry) as field_lat,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    (select count(*) from public.event_waitlist w where w.event_id = e.id) as waitlist_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined,
    exists(
      select 1 from public.event_waitlist w2
      where w2.event_id = e.id and w2.user_id = auth.uid()
    ) as is_waitlisted,
    (e.creator_id = auth.uid()) as is_mine,
    public.event_has_my_blocked_co_player(e.id, auth.uid()) as has_blocked_co_player
  from public.events e
  inner join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and f.status = 'approved'
    and public.can_view_event(e.id, auth.uid())
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
          or exists (
            select 1 from public.event_waitlist wm
            where wm.event_id = e.id and wm.user_id = auth.uid()
          )
        )
      )
      or (
        p_filter = 'spots'
        and (
          e.max_players is null
          or (select count(*) from public.event_participants eps where eps.event_id = e.id) < e.max_players
        )
      )
    )
  order by e.starts_at asc
  limit least(greatest(coalesce(p_max_rows, 200), 1), 300);
$$;

grant execute on function public.upcoming_events(text, integer) to authenticated;

notify pgrst, 'reload schema';
