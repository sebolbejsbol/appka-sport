-- ─── Tylko boiska na terenie Polski ─────────────────────────────────────────
--
-- Import OSM (Overpass) zassał także pas przygraniczny krajów sąsiednich
-- (Niemcy, Czechy, Słowacja, Ukraina, Białoruś, Litwa) — ~19,9 tys. boisk poza
-- Polską (potwierdzone nazwami: „Blau-Weiß Hasenfelde", „SK Chválkovice 1924"…).
--
-- Oznaczamy jako 'rejected' (znikają z mapy — RPC pokazuje tylko 'approved')
-- wszystkie boiska, które NIE leżą w granicach żadnego województwa, z drobnym
-- buforem 250 m chroniącym polskie boiska tuż przy granicy przed niedokładnością
-- uproszczonego poligonu granic.

update public.fields f
set status = 'rejected'
from (
  select st_buffer(st_union(geom)::geography, 250)::geometry as g
  from public.voivodeship_boundaries
) poland
where f.status = 'approved'
  and not st_contains(poland.g, f.geom::geometry);
