-- Migracja 0002: boiska (fields)
-- Uruchom w Supabase: Dashboard → SQL Editor → New query → wklej całość → Run.
-- Skrypt jest bezpieczny do ponownego uruchomienia (idempotentny).
--
-- Założenia architektoniczne (patrz PLAN.md → „Zasięg geograficzny"):
--  - współrzędne w PostGIS (geography) → zapytania „w prostokącie / w promieniu" skalują się od miasta do świata,
--  - boiska ładujemy po widocznym fragmencie mapy (funkcja public.fields_in_bbox),
--  - źródłem startowym jest OpenStreetMap (kolumny osm_type + osm_id do deduplikacji i ponownego importu).

-- 1) Rozszerzenie PostGIS (operacje geograficzne)
create extension if not exists postgis;

-- 2) Tabela boisk
create table if not exists public.fields (
  id uuid primary key default gen_random_uuid(),
  -- Identyfikacja w OpenStreetMap (do deduplikacji przy ponownym imporcie).
  osm_type text check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  name text,
  -- Dyscyplina wg tagu OSM 'sport' (np. 'basketball', 'soccer', 'tennis', 'multi'...).
  sport text,
  -- Punkt na mapie. geography(Point, 4326) = WGS84, dystanse liczone w metrach.
  geom geography(Point, 4326) not null,
  -- Status weryfikacji (docelowo admin akceptuje przed publikacją).
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'osm',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.fields is 'Boiska sportowe (źródło startowe: OpenStreetMap). geom w PostGIS, ładowane po viewport.';

-- Deduplikacja obiektów z OSM (jeden obiekt = jeden wpis).
create unique index if not exists fields_osm_unique
  on public.fields (osm_type, osm_id)
  where osm_type is not null and osm_id is not null;

-- 3) Indeks przestrzenny (klucz wydajności przy ładowaniu po fragmencie mapy)
create index if not exists fields_geom_gix on public.fields using gist (geom);

-- Indeks po statusie (szybkie filtrowanie opublikowanych).
create index if not exists fields_status_idx on public.fields (status);

-- 4) Row Level Security
alter table public.fields enable row level security;

-- Zalogowani widzą tylko boiska opublikowane (zaakceptowane).
drop policy if exists "Approved fields are viewable by authenticated users" on public.fields;
create policy "Approved fields are viewable by authenticated users"
  on public.fields for select
  to authenticated
  using (status = 'approved');

-- Uwaga: zapis (insert/update) celowo BEZ polityki dla zwykłych użytkowników.
-- Import z OSM i edycje robi rola serwisowa (service_role), która omija RLS.
-- Zgłaszanie/edycję przez użytkowników dołożymy później wraz z panelem admina.

-- 5) Automatyczne updated_at (reużywamy funkcji z migracji 0001)
drop trigger if exists fields_set_updated_at on public.fields;
create trigger fields_set_updated_at
  before update on public.fields
  for each row execute function public.set_updated_at();

-- 6) Pomocnicza funkcja: czy boisko pasuje do filtra sportu (koszykówka = też multi i basketball;soccer)
create or replace function public.field_matches_sport_filter(sport text, sport_filter text)
returns boolean
language sql
immutable
as $
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
$;

-- 7) Funkcja: boiska w widocznym prostokącie mapy (bounding box)
-- Wywoływana z aplikacji przez supabase.rpc('fields_in_bbox', {...}).
-- SECURITY INVOKER (domyślnie) → działa pod RLS wołającego (widzi tylko 'approved').
create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500
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
  limit max_rows;
$;

-- 8) Uprawnienia do wywołania RPC z aplikacji (zalogowani użytkownicy)
grant execute on function public.field_matches_sport_filter(text, text) to authenticated;
grant execute on function public.fields_in_bbox(
  double precision, double precision, double precision, double precision, integer
) to authenticated;
