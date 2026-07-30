-- ─── fields_in_bbox: szybka wersja bez join'a z ocenami ──────────────────────
--
-- Mapa nie wyświetla ocen na kropkach (szczegóły boiska pobierają oceny osobno),
-- a `left join lateral` po `field_ratings` liczony dla wszystkich pasujących
-- boisk w bbox (przed LIMIT) powodował zauważalne opóźnienie przy ładowaniu.
--
-- Usuwamy join — zostaje czysty skan przestrzenny (indeks GiST na geom) +
-- stabilne, równomierne sortowanie (md5(id)) + limit. Kolumny avg_rating /
-- rating_count zostają w sygnaturze dla zgodności (null / 0).

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
    null::numeric as avg_rating,
    0::bigint as rating_count
  from public.fields f
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
  order by md5(f.id::text)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text, text
) to authenticated;
