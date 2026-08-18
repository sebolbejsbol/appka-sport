-- ═══════════════════════════════════════════════════════════════════════════
-- 0097 — Boiska w Trójmieście brakujące w bazie (dodane/zedytowane w OSM
-- już PO jednorazowym imporcie z scripts/osm-poland/*.mjs — baza jest
-- migawką, nie żywym feedem, więc każda taka zmiana w OSM zostaje w tyle,
-- dopóki ktoś ręcznie nie doimportuje). Znalezione przez porównanie
-- aktualnego Overpass (leisure=pitch w bbox Trójmiasta) z public.fields:
--   4 boiska do koszykówki, 2 boiska do piłki nożnej.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.fields (osm_type, osm_id, name, sport, geom, source, status) values
  ('way', 1192124154, 'Boisko do koszykówki', 'basketball', st_setsrid(st_makepoint(18.3645554, 54.5511635), 4326)::geography, 'osm', 'approved'),
  ('way', 1545041611, 'Boisko do koszykówki', 'basketball', st_setsrid(st_makepoint(18.5112571, 54.5008105), 4326)::geography, 'osm', 'approved'),
  ('way', 1546040134, 'Boisko do koszykówki', 'basketball', st_setsrid(st_makepoint(18.4597712, 54.5359182), 4326)::geography, 'osm', 'approved'),
  ('way', 1548403688, 'Boisko do koszykówki', 'basketball', st_setsrid(st_makepoint(18.4811013, 54.5373293), 4326)::geography, 'osm', 'approved'),
  ('way', 215739938, 'Boisko do piłki nożnej', 'football', st_setsrid(st_makepoint(18.6203387, 54.3802021), 4326)::geography, 'osm', 'approved'),
  ('way', 1544296675, 'Boisko do piłki nożnej', 'football', st_setsrid(st_makepoint(18.4475653, 54.4939150), 4326)::geography, 'osm', 'approved')
on conflict (osm_type, osm_id) where osm_type is not null and osm_id is not null
do update set
  sport = excluded.sport,
  geom = excluded.geom,
  updated_at = now();

-- Uzupełnienie województwa dla nowych wpisów (do bąbli per województwo), tak samo jak 0060/0064.
update public.fields f
set voivodeship = b.voivodeship
from public.voivodeship_boundaries b
where f.voivodeship is null
  and st_contains(b.geom, f.geom::geometry);

notify pgrst, 'reload schema';
