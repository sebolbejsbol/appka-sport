-- Migracja 0085: rozbicie liczby aktywnych eventów per boisko NA KATEGORIĘ
-- sportu, do „chipów" na liście „W pobliżu" (np. „3 🏀 2 ⚽" zamiast jednej
-- zsumowanej liczby). Ta sama logika dostępności i to samo ograniczenie
-- bbox/województwa co event_counts_in_bbox (0083), ale bez parametru
-- sport_filter (chcemy wszystkie sporty naraz) i z grupowaniem po
-- (field_id, e.sport) zamiast tylko po field_id.
-- Uruchom: node scripts/run-supabase-sql.mjs supabase/migrations/0085_event_counts_by_category.sql

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
      and exists (
        select 1 from public.voivodeship_boundaries v
        where v.voivodeship = 'pomorskie' and st_intersects(f.geom::geometry, v.geom)
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
