-- Fixes a real bug behind "every cluster ring is grey": availability was
-- computed client-side from a globally-capped 500-row discover_events feed
-- (src/components/map-view.tsx fieldPlayersMap), which frequently didn't
-- cover every field currently loaded via event_counts_in_bbox — so most
-- fields silently fell back to 'empty' even with a real, non-zero
-- event_count. Availability is now computed here, in the SAME bbox-scoped
-- query that already computes event_count, so it's always complete and
-- consistent for whatever's actually on screen.
--
-- Per-field availability = the best status among that field's events
-- (mirrors the "any open event -> green" cluster logic already used on the
-- client): open (has real room) > filling (<=1 spot left or >=75% full) >
-- full (at capacity).

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
      and exists (
        select 1 from public.voivodeship_boundaries v
        where v.voivodeship = 'pomorskie' and st_intersects(f.geom::geometry, v.geom)
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
