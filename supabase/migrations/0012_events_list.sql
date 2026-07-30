-- Migracja 0012: lista nadchodzących eventów z filtrami
-- Uruchom w Supabase: SQL Editor → Run.

create or replace function public.upcoming_events(
  p_filter text default 'all',
  p_max_rows integer default 80
)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
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
  limit least(greatest(coalesce(p_max_rows, 80), 1), 100);
$$;

grant execute on function public.upcoming_events(text, integer) to authenticated;

notify pgrst, 'reload schema';
