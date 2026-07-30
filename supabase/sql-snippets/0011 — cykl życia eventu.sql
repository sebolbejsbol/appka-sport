-- ═══════════════════════════════════════════════════════════════════════════
-- 0011 — Cykl życia eventu
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007
-- Plik: supabase/migrations/0011_event_lifecycle.sql
-- SQL Editor: 0011 — cykl życia eventu
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

create or replace function public.finish_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_status text;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  select creator_id, status into v_creator, v_status
  from public.events
  where id = p_event_id;

  if not found then
    return 'event_not_found';
  end if;

  if auth.uid() <> v_creator and not public.is_app_admin() then
    return 'not_organizer';
  end if;

  if v_status <> 'planned' then
    return 'already_closed';
  end if;

  update public.events
  set status = 'finished'
  where id = p_event_id;

  return 'finished';
end;
$$;

grant execute on function public.finish_event(uuid) to authenticated;

-- Przedłuż event o dodatkowe minuty (organizator lub admin)
create or replace function public.extend_event(
  p_event_id uuid,
  p_extra_minutes integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
  v_status text;
  v_duration integer;
  v_new_duration integer;
begin
  if auth.uid() is null then
    return 'not_authenticated';
  end if;

  if p_extra_minutes is null or p_extra_minutes < 15 or p_extra_minutes > 180 then
    return 'invalid_duration';
  end if;

  select creator_id, status, duration_min
  into v_creator, v_status, v_duration
  from public.events
  where id = p_event_id;

  if not found then
    return 'event_not_found';
  end if;

  if auth.uid() <> v_creator and not public.is_app_admin() then
    return 'not_organizer';
  end if;

  if v_status <> 'planned' then
    return 'already_closed';
  end if;

  v_new_duration := v_duration + p_extra_minutes;
  if v_new_duration > 600 then
    return 'too_long';
  end if;

  update public.events
  set duration_min = v_new_duration
  where id = p_event_id;

  return 'extended';
end;
$$;

grant execute on function public.extend_event(uuid, integer) to authenticated;

-- Szczegóły eventu + informacja o przekroczeniu planowanego końca
create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
as $$
  with bounds as (
    select
      e.id as event_id,
      e.starts_at + (e.duration_min || ' minutes')::interval as ends_at,
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
    'ends_at', bd.ends_at,
    'is_past_scheduled_end', (e.status = 'planned' and now() > bd.ends_at),
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
      when e.status <> 'planned' then 'closed'
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

grant execute on function public.event_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
