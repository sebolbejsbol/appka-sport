-- Migracja 0101: szara nakładka "🔒 Wkrótce" na mapie rysowała granicę
-- CAŁEGO województwa pomorskiego (locked_voivodeship_boundaries, 0079) —
-- czyli DUŻO więcej niż faktyczny odblokowany obszar po migracji 0099 (25km
-- promień od centrum Trójmiasta). Efekt widoczny na żywo: pas ziemi między
-- promieniem 25km a granicą województwa (np. Kartuzy, dalsze Kaszuby) NIE
-- był wyszarzony (wyglądał na "odblokowany"), ale i tak nie pokazywał
-- żadnych boisk/eventów — granica szarej nakładki nie odpowiadała granicy
-- realnie dostępnych danych.
--
-- Ta migracja zamienia funkcję z "zwróć granice wszystkich województw poza
-- aktywnym" na "zwróć JEDEN poligon = cały widoczny obszar MINUS koło 25km
-- wokół centrum Trójmiasta" (ST_Difference dużego prostokąta i bufora
-- geography, który poprawnie liczy promień w metrach, nie w stopniach).
-- Sygnatura (parametry, kolumny) zostaje identyczna — p_active_voivodeship
-- jest teraz nieużywany (zachowany, żeby nie trzeba było zmieniać wywołań
-- we froncie: src/lib/fields.ts getLockedVoivodeshipBoundaries, używane w
-- map-view.tsx/.web.tsx i create-event-screen.tsx/.web.tsx — wszystkie 4
-- miejsca dostają poprawkę za darmo, bo renderują cokolwiek zwróci ten RPC).
--
-- Ten sam środek/promień co 0092/0099/src/lib/map-bbox.ts
-- (TRICITY_CENTER/TRICITY_RADIUS_KM) — zmiana granicy w przyszłości musi
-- dotknąć WSZYSTKICH tych miejsc.
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run,
-- albo: node scripts/run-supabase-sql.mjs supabase/migrations/0101_locked_overlay_matches_tricity_radius.sql

create or replace function public.locked_voivodeship_boundaries(p_active_voivodeship text default 'pomorskie')
returns table (voivodeship text, geojson text)
language sql
stable
as $$
  select
    'outside_tricity'::text as voivodeship,
    st_asgeojson(
      st_difference(
        st_makeenvelope(-25, 25, 45, 72, 4326),
        st_buffer(
          st_setsrid(st_makepoint(18.579, 54.438), 4326)::geography,
          25000
        )::geometry
      )
    ) as geojson;
$$;

notify pgrst, 'reload schema';
