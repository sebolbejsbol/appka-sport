-- ═══════════════════════════════════════════════════════════════════════════
-- 0039 — Ostrzeżenie: event ze zablokowanym przez Ciebie graczem
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.event_my_blocked_co_players(
  p_event_id uuid,
  p_viewer uuid default auth.uid()
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id', u.user_id,
        'nick', p.nick
      )
      order by u.sort_at
    ),
    '[]'::json
  )
  from (
    select ep.user_id, ep.joined_at as sort_at
    from public.event_participants ep
    where ep.event_id = p_event_id
    union all
    select w.user_id, w.joined_at as sort_at
    from public.event_waitlist w
    where w.event_id = p_event_id
  ) u
  left join public.profiles p on p.id = u.user_id
  where p_viewer is not null
    and u.user_id <> p_viewer
    and public.i_blocked_user(p_viewer, u.user_id);
$$;

grant execute on function public.event_my_blocked_co_players(uuid, uuid) to authenticated;

create or replace function public.event_has_my_blocked_co_player(
  p_event_id uuid,
  p_viewer uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer is not null
    and (
      exists (
        select 1 from public.event_participants ep
        where ep.event_id = p_event_id and ep.user_id = p_viewer
      )
      or exists (
        select 1 from public.event_waitlist w
        where w.event_id = p_event_id and w.user_id = p_viewer
      )
    )
    and jsonb_array_length(
      coalesce(public.event_my_blocked_co_players(p_event_id, p_viewer), '[]'::json)::jsonb
    ) > 0;
$$;

grant execute on function public.event_has_my_blocked_co_player(uuid, uuid) to authenticated;

-- ─── Szczegóły eventu ───────────────────────────────────────────────────────

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

-- ─── Lista eventów ──────────────────────────────────────────────────────────

drop function if exists public.upcoming_events(text, integer);

create or replace function public.upcoming_events(
  p_filter text default 'all',
  p_max_rows integer default 200
)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
  skill_level text,
  event_type text,
  payment_status text,
  visibility text,
  field_id uuid,
  field_name text,
  field_lng double precision,
  field_lat double precision,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  waitlist_count bigint,
  is_joined boolean,
  is_waitlisted boolean,
  is_mine boolean,
  has_blocked_co_player boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    coalesce(e.skill_level, 'any') as skill_level,
    coalesce(e.event_type, 'match') as event_type,
    coalesce(e.payment_status, 'free') as payment_status,
    coalesce(e.visibility, 'public') as visibility,
    e.field_id,
    f.name as field_name,
    st_x(f.geom::geometry) as field_lng,
    st_y(f.geom::geometry) as field_lat,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    (select count(*) from public.event_waitlist w where w.event_id = e.id) as waitlist_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined,
    exists(
      select 1 from public.event_waitlist w2
      where w2.event_id = e.id and w2.user_id = auth.uid()
    ) as is_waitlisted,
    (e.creator_id = auth.uid()) as is_mine,
    public.event_has_my_blocked_co_player(e.id, auth.uid()) as has_blocked_co_player
  from public.events e
  inner join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  where e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and f.status = 'approved'
    and public.can_view_event(e.id, auth.uid())
    and (
      coalesce(p_filter, 'all') = 'all'
      or (
        p_filter = 'mine'
        and (
          e.creator_id = auth.uid()
          or exists (
            select 1 from public.event_participants epm
            where epm.event_id = e.id and epm.user_id = auth.uid()
          )
          or exists (
            select 1 from public.event_waitlist wm
            where wm.event_id = e.id and wm.user_id = auth.uid()
          )
        )
      )
      or (
        p_filter = 'spots'
        and (
          e.max_players is null
          or (select count(*) from public.event_participants eps where eps.event_id = e.id) < e.max_players
        )
      )
    )
  order by e.starts_at asc
  limit least(greatest(coalesce(p_max_rows, 200), 1), 300);
$$;

grant execute on function public.upcoming_events(text, integer) to authenticated;

drop function if exists public.events_for_field(uuid);

create or replace function public.events_for_field(p_field_id uuid)
returns table (
  id uuid,
  title text,
  starts_at timestamptz,
  duration_min integer,
  max_players integer,
  notes text,
  status text,
  visibility text,
  creator_id uuid,
  creator_nick text,
  participant_count bigint,
  waitlist_count bigint,
  is_joined boolean,
  is_waitlisted boolean,
  has_blocked_co_player boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.starts_at,
    e.duration_min,
    e.max_players,
    e.notes,
    e.status,
    coalesce(e.visibility, 'public') as visibility,
    e.creator_id,
    cp.nick as creator_nick,
    (select count(*) from public.event_participants ep where ep.event_id = e.id) as participant_count,
    (select count(*) from public.event_waitlist w where w.event_id = e.id) as waitlist_count,
    exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ) as is_joined,
    exists(
      select 1 from public.event_waitlist w2
      where w2.event_id = e.id and w2.user_id = auth.uid()
    ) as is_waitlisted,
    public.event_has_my_blocked_co_player(e.id, auth.uid()) as has_blocked_co_player
  from public.events e
  left join public.profiles cp on cp.id = e.creator_id
  where e.field_id = p_field_id
    and e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and public.can_view_event(e.id, auth.uid())
  order by e.starts_at asc;
$$;

grant execute on function public.events_for_field(uuid) to authenticated;

notify pgrst, 'reload schema';
