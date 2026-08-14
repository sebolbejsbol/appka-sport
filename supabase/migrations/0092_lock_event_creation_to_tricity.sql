-- Migracja 0092: twarda blokada tworzenia wydarzeń poza Trójmiastem.
--
-- Do tej pory `fields_in_bbox`/`event_counts_in_bbox` (0082) ograniczały tylko
-- to, co użytkownik WIDZI na mapie — samo tworzenie eventu wstawiało dowolne
-- lat/lng wprost do `events` (przez createDiscoverEvent -> insert bezpośrednio
-- do tabeli, nie przez RPC), więc ktokolwiek mógł wybrać dowolne miasto na
-- świecie i utworzyć tam wydarzenie. Rozszerza istniejący trigger
-- `validate_event_before_insert` (BEFORE INSERT, patrz jego dotychczasowe
-- sprawdzenia wymaganych pól) o sprawdzenie odległości od centrum Trójmiasta —
-- prosty promień zamiast dokładnego polygonu (świadomy wybór, patrz PR/commit),
-- wystarczająco pokrywa Gdańsk+Gdynię+Sopot i najbliższe okolice (Rumia, Reda,
-- Pruszcz Gdański), a jednoznacznie odrzuca wszystko realnie odległe.
--
-- Środek: ~centroid Gdańsk/Gdynia/Sopot (54.438°N, 18.579°E). Promień: 25 km
-- (margines ~15km poza centrum każdego z trzech miast, więc nie ucina realnych
-- boisk na obrzeżach, ale Warszawa (~280km), Kraków (~550km), Wrocław
-- (~400km), Czechy itd. odpadają jednoznacznie).
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (CREATE OR REPLACE).

create or replace function public.validate_event_before_insert()
returns trigger
language plpgsql
as $$
declare
  v_tricity_center_lng constant double precision := 18.579;
  v_tricity_center_lat constant double precision := 54.438;
  v_tricity_radius_m constant double precision := 25000;
  v_distance_m double precision;
begin
  if coalesce(new.is_instant, false) = false then
    if new.category is null or char_length(btrim(new.category)) = 0 then
      raise exception 'EVENT_CATEGORY_REQUIRED';
    end if;
    if new.category <> 'inne' and (new.subcategory is null or char_length(btrim(new.subcategory)) = 0) then
      raise exception 'EVENT_SUBCATEGORY_REQUIRED';
    end if;
    if new.title is null or char_length(btrim(new.title)) < 3 then
      raise exception 'EVENT_TITLE_REQUIRED';
    end if;
    if new.lat is null or new.lng is null then
      raise exception 'EVENT_LOCATION_REQUIRED';
    end if;
    if new.starts_at is null then
      raise exception 'EVENT_START_REQUIRED';
    end if;
  end if;

  if new.lat is not null and new.lng is not null then
    v_distance_m := st_distance(
      st_setsrid(st_makepoint(new.lng, new.lat), 4326)::geography,
      st_setsrid(st_makepoint(v_tricity_center_lng, v_tricity_center_lat), 4326)::geography
    );
    if v_distance_m > v_tricity_radius_m then
      raise exception 'EVENT_LOCATION_OUTSIDE_TRICITY';
    end if;
  end if;

  return new;
end;
$$;
