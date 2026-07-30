-- ═══════════════════════════════════════════════════════════════════════════
-- 0023 — Rollback statystyk gracza
-- Kategoria: Eventy  |  Typ: FIX  |  Wymaga: 0007
-- Plik: supabase/migrations/0023_rollback_player_stats.sql
-- SQL Editor: 0023 — rollback statystyk
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).
-- UWAGA: migracja naprawcza — uruchom po 0007.

drop trigger if exists event_check_ins_refresh_stats on public.event_check_ins;
drop function if exists public.on_check_in_refresh_stats();
drop function if exists public.refresh_player_stats(uuid);
drop function if exists public.compute_rank_tier(integer);

alter table public.profiles
  drop constraint if exists profiles_rank_tier_check;

alter table public.profiles
  drop column if exists check_in_count,
  drop column if exists late_check_in_count,
  drop column if exists player_level,
  drop column if exists rank_points,
  drop column if exists rank_tier;

-- event_detail bez pól rangi uczestników (jak przed 0023)
create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
as $$
  with bounds as (
    select
      e.id as event_id,
      b.opens_at,
      b.closes_at
    from public.events e
    cross join lateral public.event_check_in_bounds(e.starts_at, e.duration_min) b
    where e.id = p_event_id
  )
  select json_build_object(
    'id', e.id,
    'field_id', e.field_id,
    'field_name', f.name,
    'field_lng', st_x(f.geom::geometry),
    'field_lat', st_y(f.geom::geometry),
    'title', e.title,
    'notes', e.notes,
    'starts_at', e.starts_at,
    'duration_min', e.duration_min,
    'max_players', e.max_players,
    'status', e.status,
    'sport', e.sport,
    'creator_id', e.creator_id,
    'creator_nick', cp.nick,
    'participant_count', (
      select count(*) from public.event_participants ep where ep.event_id = e.id
    ),
    'is_joined', exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ),
    'can_manage', (e.creator_id = auth.uid() or public.is_app_admin()),
    'is_admin_view', public.is_app_admin(),
    'check_in_opens_at', bd.opens_at,
    'check_in_closes_at', bd.closes_at,
    'check_in_window', case
      when now() < bd.opens_at then 'not_yet'
      when now() > bd.closes_at then 'closed'
      else 'open'
    end,
    'my_check_in', (
      select json_build_object(
        'checked_in_at', ci.checked_in_at,
        'method', ci.method,
        'is_late', ci.is_late
      )
      from public.event_check_ins ci
      where ci.event_id = e.id and ci.user_id = auth.uid()
    ),
    'participants', coalesce((
      select json_agg(
        json_build_object(
          'user_id', ep.user_id,
          'nick', pp.nick,
          'joined_at', ep.joined_at,
          'checked_in_at', ci.checked_in_at,
          'check_in_method', ci.method,
          'is_late', ci.is_late
        )
        order by ep.joined_at asc
      )
      from public.event_participants ep
      left join public.profiles pp on pp.id = ep.user_id
      left join public.event_check_ins ci
        on ci.event_id = ep.event_id and ci.user_id = ep.user_id
      where ep.event_id = e.id
    ), '[]'::json)
  )
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  left join bounds bd on bd.event_id = e.id
  where e.id = p_event_id;
$$;

notify pgrst, 'reload schema';
