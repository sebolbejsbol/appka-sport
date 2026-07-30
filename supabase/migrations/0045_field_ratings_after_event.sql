-- ═══════════════════════════════════════════════════════════════════════════
-- 0045 — Oceny boisk po uczestnictwie w evencie
-- Kategoria: Boiska  |  Typ: FEATURE  |  Wymaga: 0044
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.field_ratings
  add column if not exists event_id uuid references public.events (id) on delete cascade;

delete from public.field_ratings where event_id is null;

alter table public.field_ratings
  drop constraint if exists field_ratings_user_field_unique;

alter table public.field_ratings
  alter column event_id set not null;

alter table public.field_ratings
  drop constraint if exists field_ratings_user_event_unique;

alter table public.field_ratings
  add constraint field_ratings_user_event_unique unique (event_id, user_id);

create index if not exists field_ratings_event_idx
  on public.field_ratings (event_id);

-- ─── Eligibility ─────────────────────────────────────────────────────────

create or replace function public.user_can_rate_event_field(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    inner join public.event_participants ep
      on ep.event_id = e.id and ep.user_id = auth.uid()
    where e.id = p_event_id
      and e.status <> 'cancelled'
      and (
        e.status = 'finished'
        or now() > e.starts_at + (e.duration_min || ' minutes')::interval
      )
  );
$$;

-- ─── Submit (per event) ────────────────────────────────────────────────────

drop function if exists public.submit_field_rating(
  uuid, smallint, smallint, smallint, smallint, smallint, text
);

create or replace function public.submit_field_rating(
  p_event_id uuid,
  p_surface_score smallint,
  p_lighting_score smallint,
  p_cleanliness_score smallint,
  p_accessibility_score smallint,
  p_safety_score smallint,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_field_id uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_event_id is null then
    raise exception 'invalid_event';
  end if;

  if not public.user_can_rate_event_field(p_event_id) then
    raise exception 'not_rateable';
  end if;

  select e.field_id into v_field_id
  from public.events e
  where e.id = p_event_id;

  if v_field_id is null then
    raise exception 'invalid_event';
  end if;

  if not public.field_rating_score_valid(p_surface_score)
    or not public.field_rating_score_valid(p_lighting_score)
    or not public.field_rating_score_valid(p_cleanliness_score)
    or not public.field_rating_score_valid(p_accessibility_score)
    or not public.field_rating_score_valid(p_safety_score)
  then
    raise exception 'invalid_score';
  end if;

  if v_comment is not null and char_length(v_comment) > 500 then
    raise exception 'invalid_comment';
  end if;

  insert into public.field_ratings (
    field_id,
    event_id,
    user_id,
    surface_score,
    lighting_score,
    cleanliness_score,
    accessibility_score,
    safety_score,
    comment
  )
  values (
    v_field_id,
    p_event_id,
    v_uid,
    p_surface_score,
    p_lighting_score,
    p_cleanliness_score,
    p_accessibility_score,
    p_safety_score,
    v_comment
  )
  on conflict (event_id, user_id) do update set
    surface_score = excluded.surface_score,
    lighting_score = excluded.lighting_score,
    cleanliness_score = excluded.cleanliness_score,
    accessibility_score = excluded.accessibility_score,
    safety_score = excluded.safety_score,
    comment = excluded.comment,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ─── Summary (read-only, bez „mojej oceny”) ────────────────────────────────

drop function if exists public.field_rating_summary(uuid);

create or replace function public.field_rating_summary(p_field_id uuid)
returns table (
  rating_count bigint,
  avg_rating numeric,
  surface_avg numeric,
  lighting_avg numeric,
  cleanliness_avg numeric,
  accessibility_avg numeric,
  safety_avg numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::bigint as rating_count,
    round(avg(public.field_rating_overall(
      fr.surface_score,
      fr.lighting_score,
      fr.cleanliness_score,
      fr.accessibility_score,
      fr.safety_score
    )), 1) as avg_rating,
    round(avg(fr.surface_score), 1) as surface_avg,
    round(avg(fr.lighting_score), 1) as lighting_avg,
    round(avg(fr.cleanliness_score), 1) as cleanliness_avg,
    round(avg(fr.accessibility_score), 1) as accessibility_avg,
    round(avg(fr.safety_score), 1) as safety_avg
  from public.field_ratings fr
  where fr.field_id = p_field_id;
$$;

-- ─── Reviews list ──────────────────────────────────────────────────────────

drop function if exists public.list_field_ratings(uuid, integer);

create or replace function public.list_field_ratings(
  p_field_id uuid,
  p_limit integer default 30
)
returns table (
  id uuid,
  user_id uuid,
  nick text,
  event_starts_at timestamptz,
  surface_score smallint,
  lighting_score smallint,
  cleanliness_score smallint,
  accessibility_score smallint,
  safety_score smallint,
  overall_score numeric,
  comment text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fr.id,
    fr.user_id,
    p.nick,
    ev.starts_at as event_starts_at,
    fr.surface_score,
    fr.lighting_score,
    fr.cleanliness_score,
    fr.accessibility_score,
    fr.safety_score,
    public.field_rating_overall(
      fr.surface_score,
      fr.lighting_score,
      fr.cleanliness_score,
      fr.accessibility_score,
      fr.safety_score
    ) as overall_score,
    fr.comment,
    fr.created_at
  from public.field_ratings fr
  left join public.profiles p on p.id = fr.user_id
  left join public.events ev on ev.id = fr.event_id
  where fr.field_id = p_field_id
    and not public.i_blocked_user(auth.uid(), fr.user_id)
  order by fr.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

-- ─── event_detail: can_rate_field + my_field_rating ────────────────────────

create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
security definer
set search_path = public
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
    'skill_level', coalesce(e.skill_level, 'any'),
    'event_type', coalesce(e.event_type, 'match'),
    'payment_status', coalesce(e.payment_status, 'free'),
    'visibility', coalesce(e.visibility, 'public'),
    'creator_id', e.creator_id,
    'creator_nick', cp.nick,
    'participant_count', (
      select count(*) from public.event_participants ep where ep.event_id = e.id
    ),
    'waitlist_count', (
      select count(*) from public.event_waitlist w where w.event_id = e.id
    ),
    'is_joined', exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ),
    'is_waitlisted', exists(
      select 1 from public.event_waitlist w2
      where w2.event_id = e.id and w2.user_id = auth.uid()
    ),
    'has_blocked_co_player', public.event_has_my_blocked_co_player(e.id, auth.uid()),
    'blocked_co_players', public.event_my_blocked_co_players(e.id, auth.uid()),
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
    'can_rate_field', public.user_can_rate_event_field(e.id),
    'my_field_rating', (
      select json_build_object(
        'surface_score', fr.surface_score,
        'lighting_score', fr.lighting_score,
        'cleanliness_score', fr.cleanliness_score,
        'accessibility_score', fr.accessibility_score,
        'safety_score', fr.safety_score,
        'comment', fr.comment
      )
      from public.field_ratings fr
      where fr.event_id = e.id and fr.user_id = auth.uid()
    ),
    'participants', coalesce((
      select json_agg(
        json_build_object(
          'user_id', ep.user_id,
          'nick', pp.nick,
          'joined_at', ep.joined_at,
          'checked_in_at', ci.checked_in_at,
          'check_in_method', ci.method,
          'is_late', ci.is_late,
          'is_blocked_by_me', public.i_blocked_user(auth.uid(), ep.user_id)
        )
        order by ep.joined_at asc
      )
      from public.event_participants ep
      left join public.profiles pp on pp.id = ep.user_id
      left join public.event_check_ins ci
        on ci.event_id = ep.event_id and ci.user_id = ep.user_id
      where ep.event_id = e.id
    ), '[]'::json),
    'waitlist', case
      when e.creator_id = auth.uid() or public.is_app_admin() then coalesce((
        select json_agg(
          json_build_object(
            'user_id', w.user_id,
            'nick', wp.nick,
            'joined_at', w.joined_at,
            'is_blocked_by_me', public.i_blocked_user(auth.uid(), w.user_id)
          )
          order by w.joined_at asc
        )
        from public.event_waitlist w
        left join public.profiles wp on wp.id = w.user_id
        where w.event_id = e.id
      ), '[]'::json)
      else '[]'::json
    end
  )
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  left join bounds bd on bd.event_id = e.id
  where e.id = p_event_id
    and public.can_view_event(e.id, auth.uid());
$$;

grant execute on function public.user_can_rate_event_field(uuid) to authenticated;
grant execute on function public.submit_field_rating(uuid, smallint, smallint, smallint, smallint, smallint, text) to authenticated;

notify pgrst, 'reload schema';
