-- ═══════════════════════════════════════════════════════════════════════════
-- 0009 — Liczniki eventów na mapie
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007
-- Plik: supabase/migrations/0009_field_event_counts.sql
-- SQL Editor: 0009 — liczniki eventów na boisku
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

create or replace function public.event_counts_in_bbox(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
returns table (
  field_id uuid,
  event_count bigint
)
language sql
stable
as $$
  select
    e.field_id,
    count(*)::bigint as event_count
  from public.events e
  inner join public.fields f on f.id = e.field_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and f.status = 'approved'
    and public.field_matches_sport_filter(f.sport, 'basketball')
    and f.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography
  group by e.field_id;
$$;

grant execute on function public.event_counts_in_bbox(
  double precision, double precision, double precision, double precision
) to authenticated;

notify pgrst, 'reload schema';
