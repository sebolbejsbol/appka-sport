-- Migracja 0004: filtr boisk po sporcie (domyślnie koszykówka) — wersja podstawowa
-- ZASTĄPIONA przez 0005 (szerszy filtr: multi, basketball;soccer, place zabaw).
-- Jeśli uruchomiłeś już 0004, uruchom teraz 0005_basketball_comprehensive.sql.

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
    and (sport_filter is null or f.sport = sport_filter)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer, text
) to authenticated;

notify pgrst, 'reload schema';
