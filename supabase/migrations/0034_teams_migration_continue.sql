-- Migracja 0034: dokończenie 0032 po błędzie list_messages
-- Uruchom w Supabase SQL Editor jeśli 0032 przerwało się na:
--   "cannot change return type of existing function list_messages"
--
-- Tabele drużyn (0032 linie 1–865) powinny już istnieć — ten plik kończy resztę.

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

grant execute on function public.list_messages(uuid, integer) to authenticated;

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

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'team-logos',
    'team-logos',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do nothing;
exception
  when others then
    raise notice 'team-logos bucket skipped: %', sqlerrm;
end;
$$;

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
