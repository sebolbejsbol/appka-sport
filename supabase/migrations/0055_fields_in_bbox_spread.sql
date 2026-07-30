-- ─── fields_in_bbox: równomierna przestrzennie próbka przy oddaleniu ──────────
--
-- Problem: przy szerokim widoku (cała Polska / region) `max_rows` ucinał wynik,
-- a sortowanie po `f.name` dawało próbkę alfabetyczną — geograficznie nierówną.
-- Skutek: całe miasta (np. Białystok) bywały „puste" dopóki użytkownik nie
-- przybliżył się na tyle, że bbox obejmował już tylko je.
--
-- Rozwiązanie: dla trybu 'default' sortujemy po stabilnym haszu id
-- (md5(id)). Daje to deterministyczną, pseudolosową kolejność, więc każda
-- ucięta próbka jest rozłożona równomiernie po całym widocznym obszarze
-- (klastry pojawiają się „wszędzie" już przy oddaleniu). Tryb 'rating' działa
-- jak dotychczas (najlepiej oceniane najpierw).

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball',
  sort_by text default 'default'
)
returns table (
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision,
  avg_rating numeric,
  rating_count bigint
)
language sql
stable
as $$
  select
    f.id,
    f.name,
    f.sport,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat,
    r.avg_rating,
    coalesce(r.rating_count, 0) as rating_count
  from public.fields f
  left join lateral (
    select
      count(*)::bigint as rating_count,
      round(avg(public.field_rating_overall(
        fr.surface_score,
        fr.lighting_score,
        fr.cleanliness_score,
        fr.accessibility_score,
        fr.safety_score
      )), 1) as avg_rating
    from public.field_ratings fr
    where fr.field_id = f.id
  ) r on true
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
  order by
    case when coalesce(sort_by, 'default') = 'rating' then coalesce(r.avg_rating, 0) end desc,
    case when coalesce(sort_by, 'default') = 'rating' then coalesce(r.rating_count, 0) end desc,
    md5(f.id::text)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text, text
) to authenticated;
