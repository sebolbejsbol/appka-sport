-- ═══════════════════════════════════════════════════════════════════════════
-- 0035 — Eventy: prywatne (znajomi), lista rezerwowa, usuwanie uczestnika
-- Kategoria: Eventy  |  Typ: BASE  |  Wymaga: 0007, 0026
-- Plik: supabase/migrations/0035_events_privacy_waitlist.sql
-- SQL Editor: 0035 — eventy · prywatność i rezerwa
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists visibility text not null default 'public';

alter table public.events
  drop constraint if exists events_visibility_check;

alter table public.events
  add constraint events_visibility_check
  check (visibility in ('public', 'friends_only'));

comment on column public.events.visibility is 'public = widoczny dla wszystkich; friends_only = tylko znajomi organizatora.';

create table if not exists public.event_waitlist (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_waitlist_user_idx on public.event_waitlist (user_id);

alter table public.event_waitlist enable row level security;

drop policy if exists "Users see relevant waitlist rows" on public.event_waitlist;
create policy "Users see relevant waitlist rows"
  on public.event_waitlist for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_waitlist.event_id and e.creator_id = auth.uid()
    )
    or public.is_app_admin()
  );

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.can_view_event(p_event_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        public.is_app_admin()
        or p_user_id is null
        or e.creator_id = p_user_id
        or coalesce(e.visibility, 'public') = 'public'
        or exists (
          select 1 from public.event_participants ep
          where ep.event_id = e.id and ep.user_id = p_user_id
        )
        or exists (
          select 1 from public.event_waitlist w
          where w.event_id = e.id and w.user_id = p_user_id
        )
        or (
          e.visibility = 'friends_only'
          and public.are_friends(p_user_id, e.creator_id)
        )
      )
  );
$$;

grant execute on function public.can_view_event(uuid, uuid) to authenticated;

create or replace function public.promote_event_waitlist(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
  v_max integer;
  v_count integer;
  v_token text;
  v_title text;
begin
  select max_players into v_max from public.events where id = p_event_id;
  if v_max is null then
    return null;
  end if;

  select count(*) into v_count from public.event_participants where event_id = p_event_id;
  if v_count >= v_max then
    return null;
  end if;

  select w.user_id into v_next
  from public.event_waitlist w
  where w.event_id = p_event_id
  order by w.joined_at asc
  limit 1
  for update skip locked;

  if v_next is null then
    return null;
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, v_next)
  on conflict do nothing;

  delete from public.event_waitlist
  where event_id = p_event_id and user_id = v_next;

  select coalesce(nullif(trim(e.title), ''), 'Event'), p.expo_push_token
  into v_title, v_token
  from public.events e
  left join public.profiles p on p.id = v_next
  where e.id = p_event_id;

  perform public.send_expo_push(
    v_token,
    'Wolne miejsce na evencie',
    coalesce(v_title, 'Event'),
    jsonb_build_object('type', 'event_spot', 'event_id', p_event_id::text)
  );

  return v_next;
end;
$$;

-- ─── join / leave / remove ──────────────────────────────────────────────────

create or replace function public.join_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_max integer;
  v_count integer;
  v_status text;
  v_visibility text;
  v_creator uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  if not public.can_view_event(p_event_id, v_uid) then
    return 'forbidden';
  end if;

  select max_players, status, visibility, creator_id
  into v_max, v_status, v_visibility, v_creator
  from public.events
  where id = p_event_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'planned' then
    return 'closed';
  end if;

  if v_visibility = 'friends_only'
    and v_creator <> v_uid
    and not public.are_friends(v_uid, v_creator)
  then
    return 'friends_only';
  end if;

  if exists (
    select 1 from public.event_participants
    where event_id = p_event_id and user_id = v_uid
  ) then
    return 'already_joined';
  end if;

  if exists (
    select 1 from public.event_waitlist
    where event_id = p_event_id and user_id = v_uid
  ) then
    return 'already_waitlisted';
  end if;

  if v_max is not null then
    select count(*) into v_count
    from public.event_participants
    where event_id = p_event_id;

    if v_count >= v_max then
      insert into public.event_waitlist (event_id, user_id)
      values (p_event_id, v_uid)
      on conflict do nothing;
      return 'waitlisted';
    end if;
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, v_uid);

  return 'joined';
end;
$$;

create or replace function public.leave_event(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select creator_id into v_creator from public.events where id = p_event_id;
  if not found then
    return 'not_found';
  end if;
  if v_creator = v_uid then
    return 'organizer_cannot_leave';
  end if;

  delete from public.event_waitlist
  where event_id = p_event_id and user_id = v_uid;

  delete from public.event_participants
  where event_id = p_event_id and user_id = v_uid;

  if not found then
    return 'not_participant';
  end if;

  perform public.promote_event_waitlist(p_event_id);
  return 'left';
end;
$$;

grant execute on function public.leave_event(uuid) to authenticated;

create or replace function public.leave_event_waitlist(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  delete from public.event_waitlist
  where event_id = p_event_id and user_id = v_uid;

  if not found then
    return 'not_waitlisted';
  end if;

  return 'left_waitlist';
end;
$$;

grant execute on function public.leave_event_waitlist(uuid) to authenticated;

create or replace function public.remove_event_participant(
  p_event_id uuid,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select creator_id into v_creator
  from public.events
  where id = p_event_id;

  if not found then
    return 'not_found';
  end if;
  if v_uid <> v_creator and not public.is_app_admin() then
    return 'forbidden';
  end if;
  if p_user_id = v_creator then
    return 'cannot_remove_organizer';
  end if;

  delete from public.event_check_ins
  where event_id = p_event_id and user_id = p_user_id;

  delete from public.event_participants
  where event_id = p_event_id and user_id = p_user_id;

  if not found then
    return 'not_participant';
  end if;

  perform public.promote_event_waitlist(p_event_id);
  return 'removed';
end;
$$;

grant execute on function public.remove_event_participant(uuid, uuid) to authenticated;

-- ─── Listy eventów (filtr prywatności) ──────────────────────────────────────

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
  is_mine boolean
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
    (e.creator_id = auth.uid()) as is_mine
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
  is_waitlisted boolean
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
    ) as is_waitlisted
  from public.events e
  left join public.profiles cp on cp.id = e.creator_id
  where e.field_id = p_field_id
    and e.status = 'planned'
    and e.starts_at > now() - interval '3 hours'
    and public.can_view_event(e.id, auth.uid())
  order by e.starts_at asc;
$$;

grant execute on function public.events_for_field(uuid) to authenticated;

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
    ), '[]'::json),
    'waitlist', case
      when e.creator_id = auth.uid() or public.is_app_admin() then coalesce((
        select json_agg(
          json_build_object(
            'user_id', w.user_id,
            'nick', wp.nick,
            'joined_at', w.joined_at
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

grant execute on function public.event_detail(uuid) to authenticated;

notify pgrst, 'reload schema';
