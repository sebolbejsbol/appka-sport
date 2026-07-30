-- ═══════════════════════════════════════════════════════════════════════════
-- 0062 — Rozdzielenie siłowni + czyszczenie nazw obiektów
--
-- 1) Siłownie: rozdzielamy publiczne plenerowe (drążki / kalistenika,
--    OSM leisure=fitness_station) → 'outdoor_gym', od prywatnych klubów
--    (Zdrofit itd., leisure=fitness_centre/amenity=gym) → 'fitness'.
--    Uzupełniamy nazwy z tagów brand/operator, gdy brak `name`.
-- 2) Naprawa nazw: wcześniejsze importy „wypiekały" w kolumnie `name` polską
--    etykietę boiska (np. „Boisko do koszykówki · ul. …"). Gdy dyscyplina była
--    inna niż wypieczona etykieta, na mapie pojawiała się zła nazwa
--    (kort/koszykówka na boisku do piłki). Usuwamy wypieczony prefiks — nazwę
--    obiektu aplikacja wylicza teraz z kolumny `sport` (spójnie z field-display).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a) Plenerowe siłownie (fitness_station) → outdoor_gym (+ nazwa z brand/operator)
with raw as (
  select (extensions.http_post(
            'https://overpass-api.de/api/interpreter',
            'data=' || extensions.urlencode('[out:json][timeout:100];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="fitness_station"](area.pl););out center tags;'),
            'application/x-www-form-urlencoded')).content as c
),
src as (
  select case when left(btrim(c), 1) = '{' then btrim(c)::jsonb else null end as j from raw
),
rows as (
  select (e->>'type') osm_type, (e->>'id')::bigint osm_id,
         nullif(btrim(coalesce(e->'tags'->>'name', e->'tags'->>'brand', e->'tags'->>'operator')), '') nm
  from src, jsonb_array_elements(j->'elements') e
)
update public.fields f
set sport = 'outdoor_gym', name = coalesce(f.name, r.nm)
from rows r
where f.osm_type = r.osm_type and f.osm_id = r.osm_id and f.sport = 'fitness';

-- 1b) Prywatne kluby (fitness_centre/gym) → uzupełnij brakujące nazwy
with raw as (
  select (extensions.http_post(
            'https://overpass-api.de/api/interpreter',
            'data=' || extensions.urlencode('[out:json][timeout:100];area["ISO3166-1"="PL"][admin_level=2]->.pl;(nwr["leisure"="fitness_centre"](area.pl);nwr["amenity"="gym"](area.pl););out center tags;'),
            'application/x-www-form-urlencoded')).content as c
),
src as (
  select case when left(btrim(c), 1) = '{' then btrim(c)::jsonb else null end as j from raw
),
rows as (
  select (e->>'type') osm_type, (e->>'id')::bigint osm_id,
         nullif(btrim(coalesce(e->'tags'->>'name', e->'tags'->>'brand', e->'tags'->>'operator')), '') nm
  from src, jsonb_array_elements(j->'elements') e
)
update public.fields f
set name = r.nm
from rows r
where f.osm_type = r.osm_type and f.osm_id = r.osm_id
  and f.sport = 'fitness' and f.name is null and r.nm is not null;

-- 2) Usuń wypieczony prefiks etykiety boiska z kolumny `name` (zostaw ulicę).
update public.fields
set name = nullif(btrim(regexp_replace(
  name,
  '^(Boisko do koszykówki|Boisko do piłki nożnej|Kort tenisowy|Boisko do siatkówki|Boisko do piłki ręcznej|Boisko wielofunkcyjne|Obiekt sportowy)( · )?',
  '')), '')
where name ~ '^(Boisko do koszykówki|Boisko do piłki nożnej|Kort tenisowy|Boisko do siatkówki|Boisko do piłki ręcznej|Boisko wielofunkcyjne|Obiekt sportowy)';

notify pgrst, 'reload schema';
