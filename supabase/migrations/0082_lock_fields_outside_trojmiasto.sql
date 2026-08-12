-- The "locked region" overlay on the map was purely cosmetic (faded out by
-- zoom 7.3) — courts and event counts outside Pomorskie were still fully
-- loaded, tappable, and joinable at any real zoom level. This makes the lock
-- real: fields_in_bbox and event_counts_in_bbox now only ever return rows
-- whose court sits inside the Pomorskie (Trójmiasto) voivodeship boundary,
-- regardless of what bbox the client requests. Other regions' field/event
-- data is untouched in the database — just excluded from these two RPCs.

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball',
  sort_by text default 'default'
)
returns table(id uuid, name text, sport text, lng double precision, lat double precision, avg_rating numeric, rating_count bigint)
language sql
stable
as $$
  select
    f.id,
    f.name,
    f.sport,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    null::numeric as avg_rating,
    0::bigint as rating_count
  from public.fields f
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
    and exists (
      select 1 from public.voivodeship_boundaries v
      where v.voivodeship = 'pomorskie' and st_intersects(f.geom::geometry, v.geom)
    )
  order by md5(f.id::text)
  limit max_rows;
$$;

create or replace function public.event_counts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport_filter text default 'basketball'
)
returns table(field_id uuid, event_count bigint)
language sql
stable
security definer
set search_path to 'public'
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
    and exists (
      select 1 from public.voivodeship_boundaries v
      where v.voivodeship = 'pomorskie' and st_intersects(f.geom::geometry, v.geom)
    )
  group by e.field_id;
$$;
