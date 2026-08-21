-- Migracja 0099: fields_in_bbox / event_counts_in_bbox /
-- event_counts_by_category_in_bbox (0082/0083/0085) ograniczały widoczne
-- boiska/eventy do CAŁEGO województwa pomorskiego — to więcej niż
-- "Trójmiasto" z Promptu 1 (Gdańsk/Sopot/Gdynia + najbliższa okolica).
-- Pomorskie sięga też po Słupsk, Chojnice, Kościerzynę, Bytów — 80-150km od
-- centrum Trójmiasta, czyli realnie inny (dużo większy) obszar niż promień
-- 25km już używany do blokady TWORZENIA eventów (patrz
-- 0092_lock_event_creation_to_tricity.sql / src/lib/map-bbox.ts
-- TRICITY_CENTER/TRICITY_RADIUS_KM). Efekt: na mapie dało się zobaczyć i
-- dołączyć do boisk/eventów w Słupsku czy Chojnicach, mimo że nie dało się
-- tam założyć nowego eventu — niespójność z tym, co Prompt 1 wprost wykluczał
-- ("nie całego Pomorza"). Ta migracja zamienia sprawdzenie "czy boisko leży w
-- woj. pomorskim" na "czy boisko leży w promieniu 25km od centrum
-- Trójmiasta" we wszystkich trzech funkcjach, czyli dokładnie ten sam promień
-- co przy tworzeniu eventów.
--
-- Zmiana granicy w przyszłości: aktualizuj stałe w TRZECH miejscach —
-- tutaj, w 0092, i w src/lib/map-bbox.ts (TRICITY_CENTER/TRICITY_RADIUS_KM) —
-- Postgres i klient nie dzielą stałych.
--
-- Sygnatury zwracanych typów (id/name/.../photo_url, field_id/event_count/
-- availability, field_id/sport/event_count/availability) muszą dokładnie
-- odpowiadać aktualnym wersjom z 0084/0083/0085 — Postgres nie pozwala
-- zmieniać OUT parameters przez CREATE OR REPLACE, stąd DROP FUNCTION przed
-- każdym CREATE (ta sama lekcja, co w 0084_field_photos.sql).
--
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run,
-- albo: node scripts/run-supabase-sql.mjs supabase/migrations/0099_lock_fields_to_tricity_radius.sql

drop function if exists public.fields_in_bbox(double precision, double precision, double precision, double precision, integer, text, text);

create or replace function public.fields_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  max_rows integer default 500,
  sport_filter text default 'basketball',
  sort_by text default 'default'
)
returns table(
  id uuid,
  name text,
  sport text,
  lng double precision,
  lat double precision,
  avg_rating numeric,
  rating_count bigint,
  photo_url text
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
    0::bigint as rating_count,
    f.photo_url
  from public.fields f
  where f.status = 'approved'
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
    and public.field_matches_sport_filter(f.sport, sport_filter)
    and st_dwithin(
      f.geom,
      st_setsrid(st_makepoint(18.579, 54.438), 4326)::geography,
      25000
    )
  order by md5(f.id::text)
  limit max_rows;
$$;

grant execute on function public.fields_in_bbox(double precision, double precision, double precision, double precision, integer, text, text) to authenticated;

drop function if exists public.event_counts_in_bbox(double precision, double precision, double precision, double precision, text);

create or replace function public.event_counts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  sport_filter text default 'basketball'
)
returns table(field_id uuid, event_count bigint, availability text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_event as (
    select
      e.field_id,
      e.max_players,
      (select count(*)::int from public.event_participants ep where ep.event_id = e.id) as participants
    from public.events e
    inner join public.fields f on f.id = e.field_id
    where e.status = 'planned'
      and e.starts_at > now() - interval '3 hours'
      and f.status = 'approved'
      and public.field_matches_sport_filter(f.sport, sport_filter)
      and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
      and st_dwithin(
        f.geom,
        st_setsrid(st_makepoint(18.579, 54.438), 4326)::geography,
        25000
      )
  ),
  per_event_status as (
    select
      field_id,
      case
        when max_players is null then 'open'
        when participants >= max_players then 'full'
        when (max_players - participants) <= 1
          or participants::numeric / max_players >= 0.75 then 'filling'
        else 'open'
      end as status
    from per_event
  )
  select
    field_id,
    count(*)::bigint as event_count,
    case
      when bool_or(status = 'open') then 'open'
      when bool_or(status = 'filling') then 'filling'
      else 'full'
    end as availability
  from per_event_status
  group by field_id;
$$;

grant execute on function public.event_counts_in_bbox(double precision, double precision, double precision, double precision, text) to authenticated;

drop function if exists public.event_counts_by_category_in_bbox(double precision, double precision, double precision, double precision);

create or replace function public.event_counts_by_category_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table(field_id uuid, sport text, event_count bigint, availability text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with per_event as (
    select
      e.field_id,
      e.sport,
      e.max_players,
      (select count(*)::int from public.event_participants ep where ep.event_id = e.id) as participants
    from public.events e
    inner join public.fields f on f.id = e.field_id
    where e.status = 'planned'
      and e.starts_at > now() - interval '3 hours'
      and f.status = 'approved'
      and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
      and st_dwithin(
        f.geom,
        st_setsrid(st_makepoint(18.579, 54.438), 4326)::geography,
        25000
      )
  ),
  per_event_status as (
    select
      field_id,
      sport,
      case
        when max_players is null then 'open'
        when participants >= max_players then 'full'
        when (max_players - participants) <= 1
          or participants::numeric / max_players >= 0.75 then 'filling'
        else 'open'
      end as status
    from per_event
  )
  select
    field_id,
    sport,
    count(*)::bigint as event_count,
    case
      when bool_or(status = 'open') then 'open'
      when bool_or(status = 'filling') then 'filling'
      else 'full'
    end as availability
  from per_event_status
  group by field_id, sport;
$$;

revoke all on function public.event_counts_by_category_in_bbox(double precision, double precision, double precision, double precision) from public;
grant execute on function public.event_counts_by_category_in_bbox(double precision, double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
