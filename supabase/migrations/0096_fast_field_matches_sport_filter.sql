-- 0096: field_matches_sport_filter was catastrophically slow for the
-- default "all sports" filter (the one fields-prefetch.ts uses on every
-- cold start, and the one the map defaults to whenever no single-sport
-- chip is picked).
--
-- Root cause, confirmed with EXPLAIN ANALYZE against production data:
-- the function recursed on itself once per comma-separated token via a
-- correlated subquery (`select bool_or(field_matches_sport_filter(sport,
-- btrim(tok))) from unnest(...)`). PostgreSQL cannot inline a recursive
-- SQL-language function, so every row paid the full cost of a real
-- function call PER TOKEN. With the app's default 15-sport filter list
-- that's up to 15 real function invocations per row, over ~105k rows in
-- `fields` -- fields_in_bbox(POLAND_BBOX, ..., '<all 15 sports>') took
-- 62.2 SECONDS in production (vs 435ms for the exact same query with no
-- sport filter at all). This is the actual root cause of "boiska
-- strasznie długo się ładują" -- every cold start (no warm
-- fields-prefetch.ts cache) hit this exact code path.
--
-- Fix: rewrite as ONE flat, non-recursive expression -- split
-- sport_filter into tokens with unnest and check each token against the
-- field's sport with a plain EXISTS, instead of recursing into the
-- function again per token. The field's own ';'-split multi-sport list is
-- computed once via a LATERAL join (not once per token) since it doesn't
-- depend on which token is being checked. Single-value filters (the
-- common case, no comma) go through the exact same code path (unnest on a
-- 1-element array), so there's no special-cased branch left to keep in
-- sync. Preserves every existing alias rule (basketball<->multi tagged
-- fields, football<->soccer, volleyball<->beachvolleyball,
-- running<->athletics, skatepark<->skateboard) exactly, plus the
-- semicolon-separated multi-sport field matching. The only behavior
-- change is that 'skatepark' now also matches a ';'-multi-sport field
-- that explicitly lists 'skatepark' (the original only checked for
-- 'skateboard' in that position) -- a strict superset, not a regression.
--
-- Measured: 62,217ms -> 2,211ms for fields_in_bbox(POLAND_BBOX, 2000,
-- '<all 15 sports>') -- a ~28x speedup on the worst-case cold-start query.

create or replace function public.field_matches_sport_filter(sport text, sport_filter text)
 returns boolean
 language sql
 immutable
 parallel safe
as $function$
  select
    sport_filter is null
    or exists (
      select 1
      from unnest(string_to_array(sport_filter, ',')) as filt(tok)
      cross join lateral (select string_to_array(coalesce(sport, ''), ';') as parts) m
      where
        btrim(filt.tok) = coalesce(sport, '')
        or btrim(filt.tok) = any(m.parts)
        or (btrim(filt.tok) = 'basketball' and coalesce(sport, '') = 'multi')
        or (btrim(filt.tok) = 'football' and coalesce(sport, '') = 'soccer')
        or (btrim(filt.tok) = 'football' and 'soccer' = any(m.parts))
        or (btrim(filt.tok) = 'volleyball' and coalesce(sport, '') = 'beachvolleyball')
        or (btrim(filt.tok) = 'volleyball' and 'beachvolleyball' = any(m.parts))
        or (btrim(filt.tok) = 'running' and coalesce(sport, '') = 'athletics')
        or (btrim(filt.tok) = 'running' and 'athletics' = any(m.parts))
        or (btrim(filt.tok) = 'skatepark' and coalesce(sport, '') = 'skateboard')
        or (btrim(filt.tok) = 'skatepark' and 'skateboard' = any(m.parts))
    );
$function$;
