-- ═══════════════════════════════════════════════════════════════════════════
-- 0060 — Nowe kategorie obiektów na mapie (cała Polska, z OpenStreetMap)
--
-- Dokładamy do mapy kolejne typy obiektów obok koszykówki/piłki/tenisa:
--   running    — bieżnie / stadiony lekkoatletyczne (leisure=track)
--   fitness    — siłownie i kluby fitness, także plenerowe (leisure=fitness_centre/_station)
--   music_club — kluby muzyczne / nocne (amenity=nightclub/music_venue)
--   skatepark  — skateparki (leisure=skatepark, sport=skateboard)
--   swimming   — baseny / pływalnie / aquaparki (leisure=swimming_pool publiczne, water_park)
--   climbing   — ścianki / obiekty wspinaczkowe (sport=climbing)
--   volleyball — boiska siatkówki (sport=volleyball / beachvolleyball)
--
-- Dane pobieramy SERWEROWO przez rozszerzenie `http` (Overpass API), zapisując
-- oryginalną nazwę z OSM (tag name). Punkty spoza granic Polski są odrzucane
-- (clip do unii województw + 250 m bufor, tak jak w 0057).
--
-- Skrypt jest idempotentny: ON CONFLICT (osm_type, osm_id) DO NOTHING.
-- Wymaga dostępu do Overpass API w trakcie uruchamiania.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists http with schema extensions;

-- Reużywalna funkcja importu: pobiera obiekty z Overpass i wstawia jako boiska
-- danego typu (p_type_key) tylko w granicach Polski.
create or replace function public.import_osm_places(p_type_key text, p_overpass text)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_json jsonb;
  v_inserted integer;
begin
  perform set_config('statement_timeout', '300000', true);
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '280');

  select (extensions.http_post(
            'https://overpass-api.de/api/interpreter',
            'data=' || extensions.urlencode(p_overpass),
            'application/x-www-form-urlencoded')).content::jsonb
    into v_json;

  with rows as (
    select
      (e->>'type') as osm_type,
      (e->>'id')::bigint as osm_id,
      nullif(btrim(e->'tags'->>'name'), '') as name,
      coalesce(e->'center'->>'lon', e->>'lon')::double precision as lng,
      coalesce(e->'center'->>'lat', e->>'lat')::double precision as lat
    from jsonb_array_elements(v_json->'elements') e
  ),
  poland as (
    select st_buffer(st_union(geom)::geography, 250)::geometry g
    from public.voivodeship_boundaries
  ),
  ins as (
    insert into public.fields (osm_type, osm_id, name, sport, geom, source, status)
    select r.osm_type, r.osm_id, r.name, p_type_key,
           st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geography,
           'osm', 'approved'
    from rows r, poland p
    where r.osm_type in ('node', 'way', 'relation')
      and r.lng is not null and r.lat is not null
      and st_contains(p.g, st_setsrid(st_makepoint(r.lng, r.lat), 4326)::geometry)
    on conflict (osm_type, osm_id) where osm_type is not null and osm_id is not null
    do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end;
$$;

-- Importy poszczególnych typów (cała Polska).
select public.import_osm_places('running',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="track"]["sport"!~"horse_racing|cycling|motor|bmx|motocross|karting|motorsport"](area.pl););out center tags;');

select public.import_osm_places('fitness',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="fitness_centre"](area.pl);nwr["leisure"="fitness_station"](area.pl);nwr["amenity"="gym"](area.pl););out center tags;');

select public.import_osm_places('music_club',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["amenity"="nightclub"](area.pl);nwr["amenity"="music_venue"](area.pl);nwr["club"="music"](area.pl););out center tags;');

select public.import_osm_places('skatepark',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="skatepark"](area.pl);nwr["sport"="skateboard"](area.pl););out center tags;');

select public.import_osm_places('swimming',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="swimming_pool"]["access"~"yes|public|customers|permissive|community"](area.pl);nwr["leisure"="sports_centre"]["sport"~"swimming"](area.pl);nwr["leisure"="water_park"](area.pl););out center tags;');

select public.import_osm_places('climbing',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["sport"="climbing"](area.pl);nwr["leisure"="climbing"](area.pl););out center tags;');

select public.import_osm_places('volleyball',
  '[out:json][timeout:280];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["sport"="volleyball"](area.pl);nwr["sport"="beachvolleyball"](area.pl););out center tags;');

-- Uzupełnienie województwa dla nowych wpisów (do bąbli per województwo).
update public.fields f
set voivodeship = b.voivodeship
from public.voivodeship_boundaries b
where f.voivodeship is null
  and st_contains(b.geom, f.geom::geometry);

update public.fields f
set voivodeship = sub.voivodeship
from (
  select f2.id, n.voivodeship
  from public.fields f2
  cross join lateral (
    select b.voivodeship, b.geom <-> f2.geom::geometry as dist
    from public.voivodeship_boundaries b
    order by b.geom <-> f2.geom::geometry
    limit 1
  ) n
  where f2.status = 'approved' and f2.voivodeship is null and n.dist < 0.01
) sub
where f.id = sub.id;

notify pgrst, 'reload schema';
