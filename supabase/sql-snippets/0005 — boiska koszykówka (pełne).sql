-- ═══════════════════════════════════════════════════════════════════════════
-- 0005 — Filtr koszykówka (rozszerzony)
-- Kategoria: Boiska  |  Typ: BASE  |  Wymaga: 0004
-- Plik: supabase/migrations/0005_basketball_comprehensive.sql
-- SQL Editor: 0005 — boiska koszykówka (pełne)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

create or replace function public.field_matches_sport_filter(sport text, sport_filter text)
returns boolean
language sql
immutable
as $$
  select case
    when sport_filter is null then true
    when sport_filter = 'basketball' then
      coalesce(sport, '') = 'basketball'
      or 'basketball' = any(string_to_array(coalesce(sport, ''), ';'))
      or coalesce(sport, '') = 'multi'
    else
      coalesce(sport, '') = sport_filter
      or sport_filter = any(string_to_array(coalesce(sport, ''), ';'))
  end;
$$;

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball'
)
returns table (
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision
)
language sql
stable
as $$
  select
    f.id,
    f.name,
    f.sport,
    st_x(f.geom::geometry) as lng,
    st_y(f.geom::geometry) as lat
  from public.fields f
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
  limit max_rows;
$$;

grant execute on function public.field_matches_sport_filter(text, text) to authenticated;
grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text
) to authenticated;

-- Brakujący plac zabaw z koszem (OSM way/1131823513) — nie był w pierwszym imporcie leisure=pitch.
insert into public.fields (osm_type, osm_id, name, sport, geom, source, status) values
  ('way', 1131823513, null, 'basketball', st_setsrid(st_makepoint(18.5970389, 54.3608576), 4326)::geography, 'osm', 'approved')
on conflict (osm_type, osm_id) where osm_type is not null and osm_id is not null
do update set
  sport = excluded.sport,
  geom = excluded.geom,
  updated_at = now();

notify pgrst, 'reload schema';
