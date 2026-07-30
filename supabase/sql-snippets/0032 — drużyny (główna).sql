-- ═══════════════════════════════════════════════════════════════════════════
-- 0032 — Drużyny sportowe (główna)
-- Kategoria: Drużyny  |  Typ: BASE  |  Wymaga: 0027, 0031
-- Plik: supabase/migrations/0032_teams.sql
-- SQL Editor: 0032 — drużyny (główna)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  sport text not null default 'basketball',
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_length check (char_length(trim(name)) between 2 and 80),
  constraint teams_description_length check (
    description is null or char_length(description) <= 1000
  ),
  constraint teams_sport_allowed check (
    sport in ('basketball', 'football', 'volleyball', 'handball')
  )
);

create index if not exists teams_owner_idx on public.teams (owner_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members (user_id);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint team_invitations_no_self check (from_user_id <> to_user_id),
  constraint team_invitations_unique_pair unique (team_id, to_user_id)
);

create index if not exists team_invitations_to_pending_idx
  on public.team_invitations (to_user_id)
  where status = 'pending';

-- Rozszerzenie rozmów o typ (dm | team)
alter table public.conversations
  add column if not exists kind text not null default 'dm';

do $$
begin
  alter table public.conversations
    add constraint conversations_kind_allowed
    check (kind in ('dm', 'team'));
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.team_conversations (
  team_id uuid primary key references public.teams (id) on delete cascade,
  conversation_id uuid not null unique references public.conversations (id) on delete cascade
);

-- Udostępnianie eventów w czacie
alter table public.messages
  add column if not exists event_id uuid references public.events (id) on delete set null;

create index if not exists messages_event_idx
  on public.messages (event_id)
  where event_id is not null;

-- Zaproszenie całej drużyny na event
create table if not exists public.team_event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint team_event_invitations_unique unique (event_id, team_id)
);

create table if not exists public.team_event_invitation_responses (
  invitation_id uuid not null references public.team_event_invitations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  primary key (invitation_id, user_id)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.team_conversations enable row level security;
alter table public.team_event_invitations enable row level security;
alter table public.team_event_invitation_responses enable row level security;

-- ─── RLS (odczyt przez członkostwo) ─────────────────────────────────────────

drop policy if exists "Team members see teams" on public.teams;
create policy "Team members see teams"
  on public.teams for select to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = teams.id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Team members see roster" on public.team_members;
create policy "Team members see roster"
  on public.team_members for select to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "Users see own team invitations" on public.team_invitations;
create policy "Users see own team invitations"
  on public.team_invitations for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

drop policy if exists "Team members see team conversation link" on public.team_conversations;
create policy "Team members see team conversation link"
  on public.team_conversations for select to authenticated
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = team_conversations.team_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "See team event invitations" on public.team_event_invitations;
create policy "See team event invitations"
  on public.team_event_invitations for select to authenticated
  using (
    invited_by = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = team_event_invitations.event_id and e.creator_id = auth.uid()
    )
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_event_invitations.team_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists "See team event invitation responses" on public.team_event_invitation_responses;
create policy "See team event invitation responses"
  on public.team_event_invitation_responses for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.team_event_invitations tei
      join public.events e on e.id = tei.event_id
      where tei.id = team_event_invitation_responses.invitation_id
        and e.creator_id = auth.uid()
    )
    or exists (
      select 1
      from public.team_event_invitations tei
      join public.team_members tm on tm.team_id = tei.team_id
      where tei.id = team_event_invitation_responses.invitation_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

-- ─── Helpers ────────────────────────────────────────────────────────────────

create or replace function public.team_member_role(p_team_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.role
  from public.team_members tm
  where tm.team_id = p_team_id and tm.user_id = p_user_id;
$$;

grant execute on function public.team_member_role(uuid, uuid) to authenticated;

create or replace function public.is_team_manager(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.user_id = p_user_id
      and tm.role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_team_manager(uuid, uuid) to authenticated;

create or replace function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = p_user_id
  );
$$;

grant execute on function public.is_team_member(uuid, uuid) to authenticated;

-- ─── Czat drużyny ───────────────────────────────────────────────────────────

create or replace function public.ensure_team_conversation(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_team_member(p_team_id, v_uid) then
    raise exception 'not_member';
  end if;

  select tc.conversation_id into v_conv
  from public.team_conversations tc
  where tc.team_id = p_team_id;

  if v_conv is not null then
    return v_conv;
  end if;

  insert into public.conversations (kind) values ('team') returning id into v_conv;

  insert into public.team_conversations (team_id, conversation_id)
  values (p_team_id, v_conv);

  insert into public.conversation_members (conversation_id, user_id)
  select v_conv, tm.user_id
  from public.team_members tm
  where tm.team_id = p_team_id
  on conflict do nothing;

  return v_conv;
end;
$$;

grant execute on function public.ensure_team_conversation(uuid) to authenticated;

-- ─── Drużyny: CRUD + członkowie ─────────────────────────────────────────────

create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_sport text default 'basketball',
  p_logo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_team_id uuid;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;
  if p_sport is null or p_sport not in ('basketball', 'football', 'volleyball', 'handball') then
    raise exception 'invalid_sport';
  end if;

  insert into public.teams (name, description, sport, logo_url, owner_id)
  values (
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    p_sport,
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_uid
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_uid, 'owner');

  insert into public.conversations (kind) values ('team') returning id into v_conv;

  insert into public.team_conversations (team_id, conversation_id)
  values (v_team_id, v_conv);

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid);

  return v_team_id;
end;
$$;

grant execute on function public.create_team(text, text, text, text) to authenticated;

create or replace function public.update_team(
  p_team_id uuid,
  p_name text default null,
  p_description text default null,
  p_sport text default null,
  p_logo_url text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if not public.is_team_manager(p_team_id, v_uid) then
    return 'forbidden';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  update public.teams t
  set
    name = coalesce(v_name, t.name),
    description = case
      when p_description is null then t.description
      else nullif(trim(p_description), '')
    end,
    sport = coalesce(nullif(trim(p_sport), ''), t.sport),
    logo_url = case
      when p_logo_url is null then t.logo_url
      else nullif(trim(p_logo_url), '')
    end,
    updated_at = now()
  where t.id = p_team_id;

  if not found then
    return 'not_found';
  end if;

  return 'ok';
end;
$$;

grant execute on function public.update_team(uuid, text, text, text, text) to authenticated;

create or replace function public.list_my_teams(p_max_rows integer default 50)
returns table (
  team_id uuid,
  name text,
  logo_url text,
  sport text,
  my_role text,
  member_count bigint,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with unread as (
    select
      tc.team_id,
      count(m.id)::bigint as cnt
    from public.team_conversations tc
    join public.conversation_members cm
      on cm.conversation_id = tc.conversation_id and cm.user_id = auth.uid()
    join public.messages m
      on m.conversation_id = tc.conversation_id
      and m.sender_id <> auth.uid()
      and m.created_at > cm.last_read_at
    group by tc.team_id
  )
  select
    t.id as team_id,
    t.name,
    t.logo_url,
    t.sport,
    tm.role as my_role,
    (select count(*)::bigint from public.team_members m where m.team_id = t.id) as member_count,
    coalesce(u.cnt, 0) as unread_count
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  left join unread u on u.team_id = t.id
  where tm.user_id = auth.uid()
  order by t.updated_at desc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
$$;

grant execute on function public.list_my_teams(integer) to authenticated;

create or replace function public.get_team_detail(p_team_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team record;
  v_role text;
  v_conv uuid;
begin
  if v_uid is null then
    return json_build_object('error', 'not_authenticated');
  end if;

  select t.id, t.name, t.description, t.logo_url, t.sport, t.owner_id, t.created_at
  into v_team
  from public.teams t
  where t.id = p_team_id;

  if v_team.id is null then
    return json_build_object('error', 'not_found');
  end if;

  v_role := public.team_member_role(p_team_id, v_uid);
  if v_role is null then
    return json_build_object('error', 'forbidden');
  end if;

  select tc.conversation_id into v_conv
  from public.team_conversations tc
  where tc.team_id = p_team_id;

  return json_build_object(
    'team_id', v_team.id,
    'name', v_team.name,
    'description', v_team.description,
    'logo_url', v_team.logo_url,
    'sport', v_team.sport,
    'owner_id', v_team.owner_id,
    'created_at', v_team.created_at,
    'my_role', v_role,
    'can_manage', v_role in ('owner', 'admin'),
    'is_owner', v_role = 'owner',
    'conversation_id', v_conv,
    'member_count', (
      select count(*)::bigint from public.team_members tm where tm.team_id = p_team_id
    ),
    'members', coalesce((
      select json_agg(
        json_build_object(
          'user_id', tm.user_id,
          'nick', p.nick,
          'avatar_url', p.avatar_url,
          'role', tm.role,
          'is_online',
            p.last_seen_at is not null
            and p.last_seen_at > now() - interval '5 minutes',
          'joined_at', tm.joined_at
        )
        order by
          case tm.role when 'owner' then 0 when 'admin' then 1 else 2 end,
          tm.joined_at asc
      )
      from public.team_members tm
      join public.profiles p on p.id = tm.user_id
      where tm.team_id = p_team_id
    ), '[]'::json)
  );
end;
$$;

grant execute on function public.get_team_detail(uuid) to authenticated;

create or replace function public.invite_to_team(p_team_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_team_name text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if not public.is_team_manager(p_team_id, v_uid) then
    return 'forbidden';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    return 'invalid_user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'user_not_found';
  end if;
  if public.is_team_member(p_team_id, p_user_id) then
    return 'already_member';
  end if;

  insert into public.team_invitations (team_id, from_user_id, to_user_id, status)
  values (p_team_id, v_uid, p_user_id, 'pending')
  on conflict (team_id, to_user_id)
  do update set
    from_user_id = excluded.from_user_id,
    status = 'pending',
    created_at = now(),
    responded_at = null
  where public.team_invitations.status <> 'pending';

  if not found and exists (
    select 1 from public.team_invitations ti
    where ti.team_id = p_team_id and ti.to_user_id = p_user_id and ti.status = 'pending'
  ) then
    return 'request_pending';
  end if;

  select t.name into v_team_name from public.teams t where t.id = p_team_id;
  select p.expo_push_token into v_token from public.profiles p where p.id = p_user_id;

  perform public.send_expo_push(
    v_token,
    'Zaproszenie do drużyny',
    coalesce(v_team_name, 'Drużyna'),
    jsonb_build_object('type', 'team_invite', 'team_id', p_team_id::text)
  );

  return 'sent';
end;
$$;

grant execute on function public.invite_to_team(uuid, uuid) to authenticated;

create or replace function public.list_team_invitations_incoming()
returns table (
  invitation_id uuid,
  team_id uuid,
  team_name text,
  team_logo_url text,
  from_user_id uuid,
  from_nick text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ti.id as invitation_id,
    ti.team_id,
    t.name as team_name,
    t.logo_url as team_logo_url,
    ti.from_user_id,
    p.nick as from_nick,
    ti.created_at
  from public.team_invitations ti
  join public.teams t on t.id = ti.team_id
  join public.profiles p on p.id = ti.from_user_id
  where ti.to_user_id = auth.uid() and ti.status = 'pending'
  order by ti.created_at desc;
$$;

grant execute on function public.list_team_invitations_incoming() to authenticated;

create or replace function public.respond_team_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv record;
  v_conv uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select ti.id, ti.team_id, ti.to_user_id, ti.status
  into v_inv
  from public.team_invitations ti
  where ti.id = p_invitation_id;

  if v_inv.id is null then
    return 'not_found';
  end if;
  if v_inv.to_user_id <> v_uid then
    return 'forbidden';
  end if;
  if v_inv.status <> 'pending' then
    return 'already_responded';
  end if;

  if p_accept then
    insert into public.team_members (team_id, user_id, role)
    values (v_inv.team_id, v_uid, 'member')
    on conflict do nothing;

    select tc.conversation_id into v_conv
    from public.team_conversations tc
    where tc.team_id = v_inv.team_id;

    if v_conv is not null then
      insert into public.conversation_members (conversation_id, user_id)
      values (v_conv, v_uid)
      on conflict do nothing;
    end if;

    update public.team_invitations
    set status = 'accepted', responded_at = now()
    where id = p_invitation_id;

    return 'accepted';
  end if;

  update public.team_invitations
  set status = 'rejected', responded_at = now()
  where id = p_invitation_id;

  return 'rejected';
end;
$$;

grant execute on function public.respond_team_invitation(uuid, boolean) to authenticated;

create or replace function public.remove_team_member(p_team_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_target_role text;
  v_conv uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  v_target_role := public.team_member_role(p_team_id, p_user_id);
  if v_target_role is null then
    return 'not_member';
  end if;

  if p_user_id = v_uid then
    if v_target_role = 'owner' then
      return 'owner_cannot_leave';
    end if;
  elsif not public.is_team_manager(p_team_id, v_uid) then
    return 'forbidden';
  elsif v_target_role = 'owner' then
    return 'cannot_remove_owner';
  elsif v_target_role = 'admin' and public.team_member_role(p_team_id, v_uid) <> 'owner' then
    return 'forbidden';
  end if;

  delete from public.team_members
  where team_id = p_team_id and user_id = p_user_id;

  select tc.conversation_id into v_conv
  from public.team_conversations tc where tc.team_id = p_team_id;

  if v_conv is not null then
    delete from public.conversation_members
    where conversation_id = v_conv and user_id = p_user_id;
  end if;

  return 'removed';
end;
$$;

grant execute on function public.remove_team_member(uuid, uuid) to authenticated;

create or replace function public.set_team_member_role(
  p_team_id uuid,
  p_user_id uuid,
  p_role text
)
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
  if public.team_member_role(p_team_id, v_uid) <> 'owner' then
    return 'forbidden';
  end if;
  if p_user_id = v_uid then
    return 'invalid_user';
  end if;
  if p_role not in ('admin', 'member') then
    return 'invalid_role';
  end if;
  if not public.is_team_member(p_team_id, p_user_id) then
    return 'not_member';
  end if;

  update public.team_members
  set role = p_role
  where team_id = p_team_id and user_id = p_user_id;

  return 'ok';
end;
$$;

grant execute on function public.set_team_member_role(uuid, uuid, text) to authenticated;

create or replace function public.transfer_team_ownership(
  p_team_id uuid,
  p_new_owner_id uuid
)
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
  if public.team_member_role(p_team_id, v_uid) <> 'owner' then
    return 'forbidden';
  end if;
  if p_new_owner_id is null or p_new_owner_id = v_uid then
    return 'invalid_user';
  end if;
  if not public.is_team_member(p_team_id, p_new_owner_id) then
    return 'not_member';
  end if;

  update public.teams set owner_id = p_new_owner_id, updated_at = now() where id = p_team_id;

  update public.team_members set role = 'admin' where team_id = p_team_id and user_id = v_uid;
  update public.team_members set role = 'owner' where team_id = p_team_id and user_id = p_new_owner_id;

  return 'ok';
end;
$$;

grant execute on function public.transfer_team_ownership(uuid, uuid) to authenticated;

-- ─── Czat: nagłówek drużyny + udostępnianie eventu ──────────────────────────

create or replace function public.get_team_chat_header(p_team_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_team record;
  v_conv uuid;
begin
  if v_uid is null then
    return json_build_object('error', 'not_authenticated');
  end if;
  if not public.is_team_member(p_team_id, v_uid) then
    return json_build_object('error', 'forbidden');
  end if;

  select t.id, t.name, t.logo_url, t.sport into v_team
  from public.teams t where t.id = p_team_id;

  select tc.conversation_id into v_conv
  from public.team_conversations tc where tc.team_id = p_team_id;

  return json_build_object(
    'team_id', v_team.id,
    'team_name', v_team.name,
    'team_logo_url', v_team.logo_url,
    'sport', v_team.sport,
    'conversation_id', v_conv
  );
end;
$$;

grant execute on function public.get_team_chat_header(uuid) to authenticated;

create or replace function public.share_event_in_team_chat(
  p_team_id uuid,
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv uuid;
  v_title text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_team_member(p_team_id, v_uid) then
    raise exception 'not_member';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'event_not_found';
  end if;

  v_conv := public.ensure_team_conversation(p_team_id);
  select coalesce(nullif(trim(e.title), ''), 'Event') into v_title
  from public.events e where e.id = p_event_id;

  insert into public.messages (conversation_id, sender_id, body, event_id)
  values (v_conv, v_uid, '📅 ' || v_title, p_event_id)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.share_event_in_team_chat(uuid, uuid) to authenticated;

-- Rozszerzone list_messages (tekst + event)
-- PostgreSQL wymaga DROP przy zmianie kolumn zwracanych (OUT parameters).
drop function if exists public.list_messages(uuid, integer);

create or replace function public.list_messages(
  p_conversation_id uuid,
  p_max_rows integer default 80
)
returns table (
  id uuid,
  sender_id uuid,
  sender_nick text,
  body text,
  created_at timestamptz,
  is_mine boolean,
  event_id uuid,
  event_title text,
  event_starts_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.sender_id,
    sp.nick as sender_nick,
    m.body,
    m.created_at,
    (m.sender_id = auth.uid()) as is_mine,
    m.event_id,
    e.title as event_title,
    e.starts_at as event_starts_at
  from public.messages m
  left join public.profiles sp on sp.id = m.sender_id
  left join public.events e on e.id = m.event_id
  where m.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
    )
  order by m.created_at asc
  limit least(greatest(coalesce(p_max_rows, 80), 1), 200);
$$;

-- DM lista: tylko rozmowy 1:1 (bez czatów drużynowych)
create or replace function public.list_conversations(p_max_rows integer default 50)
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_nick text,
  other_avatar_url text,
  other_is_online boolean,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with my_dm_convs as (
    select cm.conversation_id
    from public.conversation_members cm
    inner join public.dm_conversations dm on dm.conversation_id = cm.conversation_id
    where cm.user_id = auth.uid()
  ),
  last_msg as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.body,
      m.created_at,
      m.sender_id
    from public.messages m
    inner join my_dm_convs mc on mc.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select
      m.conversation_id,
      count(*)::bigint as cnt
    from public.messages m
    inner join public.conversation_members cm
      on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
    inner join my_dm_convs mc on mc.conversation_id = m.conversation_id
    where m.sender_id <> auth.uid()
      and m.created_at > cm.last_read_at
    group by m.conversation_id
  )
  select
    c.id as conversation_id,
    other_p.id as other_user_id,
    other_p.nick as other_nick,
    other_p.avatar_url as other_avatar_url,
    (
      other_p.last_seen_at is not null
      and other_p.last_seen_at > now() - interval '5 minutes'
    ) as other_is_online,
    lm.body as last_message_body,
    coalesce(lm.created_at, c.updated_at) as last_message_at,
    lm.sender_id as last_message_sender_id,
    coalesce(u.cnt, 0) as unread_count
  from public.conversations c
  inner join my_dm_convs mc on mc.conversation_id = c.id
  inner join public.conversation_members cm_self
    on cm_self.conversation_id = c.id and cm_self.user_id = auth.uid()
  inner join public.conversation_members cm_other
    on cm_other.conversation_id = c.id and cm_other.user_id <> auth.uid()
  inner join public.profiles other_p on other_p.id = cm_other.user_id
  left join last_msg lm on lm.conversation_id = c.id
  left join unread u on u.conversation_id = c.id
  order by coalesce(lm.created_at, c.updated_at) desc
  limit least(greatest(coalesce(p_max_rows, 50), 1), 100);
$$;

-- Push: DM (1 odbiorca) lub czat drużyny (wszyscy poza nadawcą)
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
  v_sender_nick text;
  v_team_id uuid;
  v_title text;
  v_body text;
begin
  select p.nick into v_sender_nick
  from public.profiles p
  where p.id = new.sender_id;

  select tc.team_id into v_team_id
  from public.team_conversations tc
  where tc.conversation_id = new.conversation_id;

  if v_team_id is not null then
    v_title := coalesce(nullif(trim(v_sender_nick), ''), 'Czat drużyny');
    v_body := left(new.body, 160);

    for v_recipient in
      select cm.user_id, p.expo_push_token
      from public.conversation_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.conversation_id = new.conversation_id
        and cm.user_id <> new.sender_id
    loop
      perform public.send_expo_push(
        v_recipient.expo_push_token,
        v_title,
        v_body,
        jsonb_build_object(
          'type', 'team_message',
          'team_id', v_team_id::text,
          'conversation_id', new.conversation_id::text
        )
      );
    end loop;
  else
    select cm.user_id, p.expo_push_token
    into v_recipient
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
    limit 1;

    if v_recipient.user_id is not null then
      perform public.send_expo_push(
        v_recipient.expo_push_token,
        coalesce(nullif(trim(v_sender_nick), ''), 'Nowa wiadomość'),
        left(new.body, 160),
        jsonb_build_object(
          'type', 'dm',
          'conversation_id', new.conversation_id::text
        )
      );
    end if;
  end if;

  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

-- ─── Zaproszenie drużyny na event ─────────────────────────────────────────────

create or replace function public.invite_team_to_event(p_event_id uuid, p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv_id uuid;
  v_event_title text;
  v_team_name text;
  v_member record;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if not exists (
    select 1 from public.events e
    where e.id = p_event_id and e.creator_id = v_uid
  ) then
    return 'forbidden';
  end if;
  if not public.is_team_member(p_team_id, v_uid) then
    return 'not_team_member';
  end if;

  insert into public.team_event_invitations (event_id, team_id, invited_by)
  values (p_event_id, p_team_id, v_uid)
  on conflict (event_id, team_id) do nothing
  returning id into v_inv_id;

  if v_inv_id is null then
    select tei.id into v_inv_id
    from public.team_event_invitations tei
    where tei.event_id = p_event_id and tei.team_id = p_team_id;
    return 'already_invited';
  end if;

  insert into public.team_event_invitation_responses (invitation_id, user_id, status)
  select v_inv_id, tm.user_id, 'pending'
  from public.team_members tm
  where tm.team_id = p_team_id
  on conflict do nothing;

  select e.title into v_event_title from public.events e where e.id = p_event_id;
  select t.name into v_team_name from public.teams t where t.id = p_team_id;

  for v_member in
    select tm.user_id, p.expo_push_token
    from public.team_members tm
    join public.profiles p on p.id = tm.user_id
    where tm.team_id = p_team_id
  loop
    perform public.send_expo_push(
      v_member.expo_push_token,
      'Zaproszenie drużyny na mecz',
      coalesce(v_team_name, 'Drużyna') || ' → ' || coalesce(nullif(trim(v_event_title), ''), 'Event'),
      jsonb_build_object(
        'type', 'team_event_invite',
        'event_id', p_event_id::text,
        'team_id', p_team_id::text,
        'invitation_id', v_inv_id::text
      )
    );
  end loop;

  return 'ok';
end;
$$;

grant execute on function public.invite_team_to_event(uuid, uuid) to authenticated;

create or replace function public.respond_team_event_invitation(
  p_invitation_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_event_id uuid;
  v_status text;
  v_join text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select tei.event_id into v_event_id
  from public.team_event_invitations tei
  where tei.id = p_invitation_id;

  if v_event_id is null then
    return 'not_found';
  end if;

  if not exists (
    select 1
    from public.team_event_invitation_responses r
    where r.invitation_id = p_invitation_id and r.user_id = v_uid
  ) then
    return 'forbidden';
  end if;

  v_status := case when p_accept then 'accepted' else 'declined' end;

  update public.team_event_invitation_responses
  set status = v_status, responded_at = now()
  where invitation_id = p_invitation_id and user_id = v_uid;

  if p_accept then
    v_join := public.join_event(v_event_id);
    if v_join in ('joined', 'already_joined') then
      return 'accepted';
    end if;
    return 'accepted_no_join';
  end if;

  return 'declined';
end;
$$;

grant execute on function public.respond_team_event_invitation(uuid, boolean) to authenticated;

create or replace function public.list_event_team_invitations(p_event_id uuid)
returns table (
  invitation_id uuid,
  team_id uuid,
  team_name text,
  team_logo_url text,
  member_count bigint,
  accepted_count bigint,
  declined_count bigint,
  pending_count bigint,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tei.id as invitation_id,
    tei.team_id,
    t.name as team_name,
    t.logo_url as team_logo_url,
    (select count(*)::bigint from public.team_members tm where tm.team_id = tei.team_id),
    (select count(*)::bigint from public.team_event_invitation_responses r
      where r.invitation_id = tei.id and r.status = 'accepted'),
    (select count(*)::bigint from public.team_event_invitation_responses r
      where r.invitation_id = tei.id and r.status = 'declined'),
    (select count(*)::bigint from public.team_event_invitation_responses r
      where r.invitation_id = tei.id and r.status = 'pending'),
    tei.created_at as invited_at
  from public.team_event_invitations tei
  join public.teams t on t.id = tei.team_id
  join public.events e on e.id = tei.event_id
  where tei.event_id = p_event_id
    and (e.creator_id = auth.uid() or public.is_app_admin())
  order by tei.created_at desc;
$$;

grant execute on function public.list_event_team_invitations(uuid) to authenticated;

create or replace function public.list_my_pending_team_event_invitations()
returns table (
  invitation_id uuid,
  event_id uuid,
  event_title text,
  event_starts_at timestamptz,
  team_id uuid,
  team_name text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tei.id as invitation_id,
    tei.event_id,
    e.title as event_title,
    e.starts_at as event_starts_at,
    tei.team_id,
    t.name as team_name,
    r.status
  from public.team_event_invitation_responses r
  join public.team_event_invitations tei on tei.id = r.invitation_id
  join public.events e on e.id = tei.event_id
  join public.teams t on t.id = tei.team_id
  where r.user_id = auth.uid() and r.status = 'pending'
  order by e.starts_at asc;
$$;

grant execute on function public.list_my_pending_team_event_invitations() to authenticated;

-- ─── Storage: logo drużyny ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos',
  'team-logos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "Team managers upload logos" on storage.objects;
create policy "Team managers upload logos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and public.is_team_manager(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

drop policy if exists "Team managers update logos" on storage.objects;
create policy "Team managers update logos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'team-logos'
    and public.is_team_manager(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

drop policy if exists "Public read team logos" on storage.objects;
create policy "Public read team logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'team-logos');

notify pgrst, 'reload schema';
