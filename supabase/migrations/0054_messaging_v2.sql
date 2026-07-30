-- Migracja 0054: Wiadomości v2 (poziom Messengera)
-- Rozbudowa istniejącego modułu (0027 DM + 0032 czat drużyn) o:
--   • grupy tworzone przez użytkowników (kind='group') z rolami owner/admin/member,
--   • typy wiadomości (text/image/video/file/audio/system) + załączniki,
--   • reakcje emoji, odpowiedzi (reply), edycję i miękkie usuwanie,
--   • statusy dostarczono/odczytano (1:1 i grupowe), przypinanie, wyciszanie,
--   • paginację, wyszukiwanie, rate limiting / anty-spam,
--   • bucket Storage `chat-media` + RLS.
-- Wszystko addytywne i idempotentne. Uruchom: Supabase SQL Editor → Run.

-- ════════════════════════════════════════════════════════════════════════════
-- A. ROZMOWY: typ 'group' + metadane grupy
-- ════════════════════════════════════════════════════════════════════════════
do $$
begin
  alter table public.conversations drop constraint if exists conversations_kind_allowed;
  alter table public.conversations
    add constraint conversations_kind_allowed check (kind in ('dm', 'team', 'group'));
end;
$$;

alter table public.conversations
  add column if not exists title text,
  add column if not exists photo_url text,
  add column if not exists owner_id uuid references auth.users (id) on delete set null,
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ════════════════════════════════════════════════════════════════════════════
-- B. CZŁONKOWIE: role, przypięcie, wyciszenie, status dostarczenia
-- ════════════════════════════════════════════════════════════════════════════
alter table public.conversation_members
  add column if not exists role text not null default 'member',
  add column if not exists pinned boolean not null default false,
  add column if not exists muted boolean not null default false,
  add column if not exists last_delivered_at timestamptz not null default now();

do $$
begin
  alter table public.conversation_members
    add constraint conversation_members_role_allowed
    check (role in ('owner', 'admin', 'member'));
exception
  when duplicate_object then null;
end;
$$;

create index if not exists conversation_members_pinned_idx
  on public.conversation_members (user_id) where pinned;

-- ════════════════════════════════════════════════════════════════════════════
-- C. WIADOMOŚCI: typy, reply, edycja, miękkie usuwanie, metadane systemowe
-- ════════════════════════════════════════════════════════════════════════════
alter table public.messages
  add column if not exists kind text not null default 'text',
  add column if not exists reply_to_id uuid references public.messages (id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists metadata jsonb;

-- body może być puste dla wiadomości multimedialnych / systemowych
alter table public.messages alter column body drop not null;

do $$
begin
  alter table public.messages drop constraint if exists messages_body_length;
  alter table public.messages
    add constraint messages_body_v2 check (
      deleted_at is not null
      or kind = 'system'
      or (kind = 'text' and body is not null and char_length(btrim(body)) between 1 and 4000)
      or (kind in ('image', 'video', 'file', 'audio'))
    );
  alter table public.messages
    add constraint messages_kind_allowed
    check (kind in ('text', 'image', 'video', 'file', 'audio', 'system'));
exception
  when duplicate_object then null;
end;
$$;

create index if not exists messages_reply_idx
  on public.messages (reply_to_id) where reply_to_id is not null;

-- ════════════════════════════════════════════════════════════════════════════
-- D. ZAŁĄCZNIKI
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'file', 'audio')),
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_ms integer,
  file_name text,
  thumbnail_path text,
  created_at timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

-- ════════════════════════════════════════════════════════════════════════════
-- E. REAKCJE EMOJI
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

-- ════════════════════════════════════════════════════════════════════════════
-- F. RLS dla nowych tabel + realtime
-- ════════════════════════════════════════════════════════════════════════════
alter table public.message_attachments enable row level security;
alter table public.message_reactions enable row level security;

drop policy if exists "Members read attachments" on public.message_attachments;
create policy "Members read attachments"
  on public.message_attachments for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_attachments.message_id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Members read reactions" on public.message_reactions;
create policy "Members read reactions"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.conversation_members cm on cm.conversation_id = m.conversation_id
      where m.id = message_reactions.message_id and cm.user_id = auth.uid()
    )
  );

alter table public.message_reactions replica identity full;
alter table public.message_attachments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.message_attachments;
exception when duplicate_object then null;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- G. STORAGE: bucket chat-media
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

drop policy if exists "chat-media read" on storage.objects;
create policy "chat-media read"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-media');

drop policy if exists "chat-media insert own" on storage.objects;
create policy "chat-media insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat-media delete own" on storage.objects;
create policy "chat-media delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ════════════════════════════════════════════════════════════════════════════
-- H. HELPERY
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.conversation_member_role(p_conversation_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select cm.role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = p_user_id;
$$;

grant execute on function public.conversation_member_role(uuid, uuid) to authenticated;

-- Wiadomość systemowa (Jan dodał Annę, zmiana nazwy itp.).
-- metadata przechowuje akcję + uczestników (język renderowany na kliencie).
create or replace function public.insert_system_message(
  p_conversation_id uuid,
  p_actor_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.messages (conversation_id, sender_id, body, kind, metadata)
  values (
    p_conversation_id,
    p_actor_id,
    null,
    'system',
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('action', p_action)
  )
  returning id into v_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;
  return v_id;
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- I. GRUPY — zarządzanie
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.create_group(p_title text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(btrim(p_title), '');
  v_conv uuid;
  v_member uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_title is null or char_length(v_title) > 80 then raise exception 'invalid_title'; end if;

  insert into public.conversations (kind, title, owner_id, created_by)
  values ('group', v_title, v_uid, v_uid)
  returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv, v_uid, 'owner');

  if p_member_ids is not null then
    foreach v_member in array p_member_ids loop
      if v_member is not null and v_member <> v_uid
         and exists (select 1 from public.profiles p where p.id = v_member) then
        insert into public.conversation_members (conversation_id, user_id, role)
        values (v_conv, v_member, 'member')
        on conflict (conversation_id, user_id) do nothing;
      end if;
    end loop;
  end if;

  perform public.insert_system_message(v_conv, v_uid, 'group_created',
    jsonb_build_object('title', v_title));

  return v_conv;
end;
$$;

grant execute on function public.create_group(text, uuid[]) to authenticated;

create or replace function public.set_group_title(p_conversation_id uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(btrim(p_title), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_title is null or char_length(v_title) > 80 then raise exception 'invalid_title'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  update public.conversations
  set title = v_title, updated_at = now()
  where id = p_conversation_id and kind = 'group';

  perform public.insert_system_message(p_conversation_id, v_uid, 'group_renamed',
    jsonb_build_object('title', v_title));
end;
$$;

grant execute on function public.set_group_title(uuid, text) to authenticated;

create or replace function public.set_group_photo(p_conversation_id uuid, p_photo_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  update public.conversations
  set photo_url = nullif(btrim(p_photo_url), ''), updated_at = now()
  where id = p_conversation_id and kind = 'group';

  perform public.insert_system_message(p_conversation_id, v_uid, 'group_photo_changed', '{}'::jsonb);
end;
$$;

grant execute on function public.set_group_photo(uuid, text) to authenticated;

create or replace function public.add_group_members(p_conversation_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  if p_user_ids is not null then
    foreach v_member in array p_user_ids loop
      if v_member is not null
         and exists (select 1 from public.profiles p where p.id = v_member)
         and not exists (
           select 1 from public.conversation_members cm
           where cm.conversation_id = p_conversation_id and cm.user_id = v_member
         ) then
        insert into public.conversation_members (conversation_id, user_id, role)
        values (p_conversation_id, v_member, 'member');
        perform public.insert_system_message(p_conversation_id, v_uid, 'member_added',
          jsonb_build_object('target_id', v_member));
      end if;
    end loop;
  end if;
end;
$$;

grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

create or replace function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_role text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  v_target_role := public.conversation_member_role(p_conversation_id, p_user_id);
  if v_target_role is null then return; end if;
  if v_target_role = 'owner' then raise exception 'cannot_remove_owner'; end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;

  perform public.insert_system_message(p_conversation_id, v_uid, 'member_removed',
    jsonb_build_object('target_id', p_user_id));
end;
$$;

grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

create or replace function public.set_group_member_role(
  p_conversation_id uuid, p_user_id uuid, p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) <> 'owner' then
    raise exception 'forbidden';
  end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role'; end if;
  if p_user_id = v_uid then raise exception 'cannot_change_self'; end if;

  update public.conversation_members
  set role = p_role
  where conversation_id = p_conversation_id and user_id = p_user_id and role <> 'owner';

  perform public.insert_system_message(p_conversation_id, v_uid, 'role_changed',
    jsonb_build_object('target_id', p_user_id, 'role', p_role));
end;
$$;

grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;

create or replace function public.leave_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_heir uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_role := public.conversation_member_role(p_conversation_id, v_uid);
  if v_role is null then return; end if;

  -- Właściciel: przekaż własność najstarszemu pozostałemu członkowi (admin > member).
  if v_role = 'owner' then
    select cm.user_id into v_heir
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_uid
    order by (cm.role = 'admin') desc, cm.joined_at asc
    limit 1;

    if v_heir is not null then
      update public.conversation_members set role = 'owner'
      where conversation_id = p_conversation_id and user_id = v_heir;
      update public.conversations set owner_id = v_heir where id = p_conversation_id;
    end if;
  end if;

  delete from public.conversation_members
  where conversation_id = p_conversation_id and user_id = v_uid;

  perform public.insert_system_message(p_conversation_id, v_uid, 'member_left', '{}'::jsonb);

  -- Pusta grupa znika.
  if not exists (
    select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id
  ) then
    delete from public.conversations where id = p_conversation_id;
  end if;
end;
$$;

grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.delete_group(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if public.conversation_member_role(p_conversation_id, v_uid) <> 'owner' then
    raise exception 'forbidden';
  end if;
  delete from public.conversations where id = p_conversation_id and kind = 'group';
end;
$$;

grant execute on function public.delete_group(uuid) to authenticated;

create or replace function public.group_members(p_conversation_id uuid)
returns table (
  user_id uuid,
  nick text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  is_online boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.user_id,
    p.nick,
    p.avatar_url,
    cm.role,
    cm.joined_at,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members me
      where me.conversation_id = p_conversation_id and me.user_id = auth.uid()
    )
  order by (cm.role = 'owner') desc, (cm.role = 'admin') desc, p.nick asc;
$$;

grant execute on function public.group_members(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- J. WIADOMOŚCI v2 — wysyłka (tekst/media/reply) z rate limitingiem
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.send_message_v2(
  p_conversation_id uuid,
  p_body text default null,
  p_kind text default 'text',
  p_reply_to_id uuid default null,
  p_attachments jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := nullif(btrim(p_body), '');
  v_kind text := coalesce(p_kind, 'text');
  v_id uuid;
  v_now timestamptz := now();
  v_recent int;
  v_att jsonb;
  v_media_type text;
  v_size bigint;
  v_max_image constant bigint := 10 * 1024 * 1024;
  v_max_video constant bigint := 100 * 1024 * 1024;
  v_max_audio constant bigint := 25 * 1024 * 1024;
  v_max_file constant bigint := 25 * 1024 * 1024;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_kind not in ('text', 'image', 'video', 'file', 'audio') then
    raise exception 'invalid_kind';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_uid
  ) then
    raise exception 'not_member';
  end if;

  -- Anti-spam / rate limiting: max 10 wiadomości / 10 s na użytkownika.
  select count(*) into v_recent
  from public.messages m
  where m.sender_id = v_uid and m.created_at > v_now - interval '10 seconds';
  if v_recent >= 10 then raise exception 'rate_limited'; end if;

  if v_kind = 'text' then
    if v_body is null or char_length(v_body) > 4000 then raise exception 'invalid_body'; end if;
  else
    if p_attachments is null or jsonb_typeof(p_attachments) <> 'array'
       or jsonb_array_length(p_attachments) = 0
       or jsonb_array_length(p_attachments) > 10 then
      raise exception 'invalid_attachments';
    end if;
    for v_att in select * from jsonb_array_elements(p_attachments) loop
      v_media_type := v_att->>'media_type';
      v_size := coalesce((v_att->>'size_bytes')::bigint, 0);
      if v_media_type not in ('image', 'video', 'file', 'audio') then
        raise exception 'invalid_media_type';
      end if;
      if (v_media_type = 'image' and v_size > v_max_image)
         or (v_media_type = 'video' and v_size > v_max_video)
         or (v_media_type = 'audio' and v_size > v_max_audio)
         or (v_media_type = 'file' and v_size > v_max_file) then
        raise exception 'file_too_large';
      end if;
    end loop;
  end if;

  if p_reply_to_id is not null and not exists (
    select 1 from public.messages m
    where m.id = p_reply_to_id and m.conversation_id = p_conversation_id
  ) then
    raise exception 'invalid_reply';
  end if;

  insert into public.messages (conversation_id, sender_id, body, kind, reply_to_id)
  values (p_conversation_id, v_uid, case when v_kind = 'text' then v_body else v_body end, v_kind, p_reply_to_id)
  returning id into v_id;

  if v_kind <> 'text' then
    insert into public.message_attachments (
      message_id, media_type, storage_path, mime_type, size_bytes,
      width, height, duration_ms, file_name, thumbnail_path
    )
    select
      v_id,
      a->>'media_type',
      a->>'storage_path',
      a->>'mime_type',
      nullif(a->>'size_bytes', '')::bigint,
      nullif(a->>'width', '')::int,
      nullif(a->>'height', '')::int,
      nullif(a->>'duration_ms', '')::int,
      a->>'file_name',
      a->>'thumbnail_path'
    from jsonb_array_elements(p_attachments) a;
  end if;

  update public.conversations set updated_at = v_now where id = p_conversation_id;
  update public.conversation_members
  set last_read_at = v_now, last_delivered_at = v_now
  where conversation_id = p_conversation_id and user_id = v_uid;

  return json_build_object('id', v_id, 'created_at', v_now);
end;
$$;

grant execute on function public.send_message_v2(uuid, text, text, uuid, jsonb) to authenticated;

-- Edycja własnej wiadomości tekstowej
create or replace function public.edit_message(p_message_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := nullif(btrim(p_body), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_body is null or char_length(v_body) > 4000 then raise exception 'invalid_body'; end if;

  update public.messages
  set body = v_body, edited_at = now()
  where id = p_message_id and sender_id = v_uid and kind = 'text' and deleted_at is null;

  if not found then raise exception 'forbidden'; end if;
end;
$$;

grant execute on function public.edit_message(uuid, text) to authenticated;

-- Miękkie usuwanie (autor lub admin/owner grupy)
create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conv uuid;
  v_sender uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select conversation_id, sender_id into v_conv, v_sender
  from public.messages where id = p_message_id;
  if v_conv is null then return; end if;

  if v_sender <> v_uid
     and public.conversation_member_role(v_conv, v_uid) not in ('owner', 'admin') then
    raise exception 'forbidden';
  end if;

  update public.messages
  set deleted_at = now(), body = null, metadata = jsonb_build_object('deleted_by', v_uid)
  where id = p_message_id;

  delete from public.message_attachments where message_id = p_message_id;
  delete from public.message_reactions where message_id = p_message_id;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

-- Reakcja emoji (przełącznik)
create or replace function public.toggle_reaction(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emoji text := nullif(btrim(p_emoji), '');
  v_conv uuid;
  v_exists boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_emoji is null or char_length(v_emoji) > 16 then raise exception 'invalid_emoji'; end if;

  select conversation_id into v_conv from public.messages where id = p_message_id and deleted_at is null;
  if v_conv is null then raise exception 'not_found'; end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = v_conv and cm.user_id = v_uid
  ) then
    raise exception 'not_member';
  end if;

  select exists (
    select 1 from public.message_reactions
    where message_id = p_message_id and user_id = v_uid and emoji = v_emoji
  ) into v_exists;

  if v_exists then
    delete from public.message_reactions
    where message_id = p_message_id and user_id = v_uid and emoji = v_emoji;
    return false;
  else
    insert into public.message_reactions (message_id, user_id, emoji)
    values (p_message_id, v_uid, v_emoji)
    on conflict do nothing;
    return true;
  end if;
end;
$$;

grant execute on function public.toggle_reaction(uuid, text) to authenticated;

-- Oznacz jako dostarczone (odbiorca odebrał na żywo / wszedł na listę)
create or replace function public.mark_conversation_delivered(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.conversation_members
  set last_delivered_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_conversation_delivered(uuid) to authenticated;

-- Przypięcie / wyciszenie rozmowy (per użytkownik)
create or replace function public.set_conversation_pinned(p_conversation_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.conversation_members
  set pinned = coalesce(p_pinned, false)
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_conversation_pinned(uuid, boolean) to authenticated;

create or replace function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.conversation_members
  set muted = coalesce(p_muted, false)
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- K. LISTA ROZMÓW v2 (DM + grupy, piny, nieprzeczytane, podgląd)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.list_conversations_v2(p_max_rows integer default 60)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with my as (
    select cm.conversation_id, cm.last_read_at, cm.pinned, cm.muted
    from public.conversation_members cm
    where cm.user_id = auth.uid()
  ),
  base as (
    select c.id, c.kind, c.title, c.photo_url, c.updated_at, m.last_read_at, m.pinned, m.muted
    from public.conversations c
    join my m on m.conversation_id = c.id
    where c.kind in ('dm', 'group')
  ),
  last_msg as (
    select distinct on (msg.conversation_id)
      msg.conversation_id, msg.body, msg.kind, msg.created_at, msg.sender_id, msg.deleted_at
    from public.messages msg
    join base b on b.id = msg.conversation_id
    order by msg.conversation_id, msg.created_at desc
  ),
  unread as (
    select msg.conversation_id, count(*)::int as cnt
    from public.messages msg
    join my m on m.conversation_id = msg.conversation_id
    where msg.sender_id <> auth.uid()
      and msg.created_at > m.last_read_at
      and msg.deleted_at is null
    group by msg.conversation_id
  )
  select coalesce(json_agg(row order by row.pinned desc, row.last_at desc), '[]'::json)
  from (
    select
      b.id as conversation_id,
      b.kind,
      b.pinned,
      b.muted,
      coalesce(lm.created_at, b.updated_at) as last_at,
      json_build_object(
        'body', lm.body,
        'kind', lm.kind,
        'created_at', lm.created_at,
        'sender_id', lm.sender_id,
        'is_deleted', lm.deleted_at is not null
      ) as last_message,
      coalesce(u.cnt, 0) as unread_count,
      case when b.kind = 'group' then b.title else other_p.nick end as title,
      case when b.kind = 'group' then b.photo_url else other_p.avatar_url end as photo_url,
      case when b.kind = 'dm' then other_p.id end as other_user_id,
      case when b.kind = 'dm' then
        (other_p.last_seen_at is not null and other_p.last_seen_at > now() - interval '5 minutes')
      else false end as other_is_online,
      case when b.kind = 'group' then
        (select count(*)::int from public.conversation_members cm2 where cm2.conversation_id = b.id)
      else 2 end as member_count
    from base b
    left join last_msg lm on lm.conversation_id = b.id
    left join unread u on u.conversation_id = b.id
    left join lateral (
      select p.id, p.nick, p.avatar_url, p.last_seen_at
      from public.conversation_members cmo
      join public.profiles p on p.id = cmo.user_id
      where cmo.conversation_id = b.id and cmo.user_id <> auth.uid()
      limit 1
    ) other_p on b.kind = 'dm'
    limit least(greatest(coalesce(p_max_rows, 60), 1), 100)
  ) row;
$$;

grant execute on function public.list_conversations_v2(integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- L. WIADOMOŚCI v2 (paginacja + załączniki + reakcje + reply + statusy)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.list_messages_v2(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 30
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_result json;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_uid
  ) then
    raise exception 'not_member';
  end if;

  select kind into v_kind from public.conversations where id = p_conversation_id;

  with picked as (
    select m.*
    from public.messages m
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  )
  select coalesce(json_agg(obj order by obj_created_at asc), '[]'::json)
  into v_result
  from (
    select
      m.created_at as obj_created_at,
      json_build_object(
        'id', m.id,
        'conversation_id', m.conversation_id,
        'sender_id', m.sender_id,
        'sender_nick', sp.nick,
        'sender_avatar_url', sp.avatar_url,
        'is_mine', (m.sender_id = v_uid),
        'kind', m.kind,
        'body', m.body,
        'created_at', m.created_at,
        'edited_at', m.edited_at,
        'is_deleted', m.deleted_at is not null,
        'metadata', m.metadata,
        'event_id', m.event_id,
        'event_title', ev.title,
        'event_starts_at', ev.starts_at,
        'reply_to', case when rm.id is null then null else json_build_object(
          'id', rm.id,
          'sender_nick', rp.nick,
          'kind', rm.kind,
          'body', rm.body,
          'is_deleted', rm.deleted_at is not null
        ) end,
        'attachments', coalesce((
          select json_agg(json_build_object(
            'id', a.id,
            'media_type', a.media_type,
            'storage_path', a.storage_path,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes,
            'width', a.width,
            'height', a.height,
            'duration_ms', a.duration_ms,
            'file_name', a.file_name,
            'thumbnail_path', a.thumbnail_path
          ) order by a.created_at)
          from public.message_attachments a where a.message_id = m.id
        ), '[]'::json),
        'reactions', coalesce((
          select json_agg(json_build_object(
            'emoji', r.emoji, 'count', r.cnt, 'mine', r.mine
          ) order by r.cnt desc)
          from (
            select emoji, count(*)::int as cnt, bool_or(user_id = v_uid) as mine
            from public.message_reactions
            where message_id = m.id
            group by emoji
          ) r
        ), '[]'::json),
        -- status własnej wiadomości
        'status', case
          when m.sender_id <> v_uid then null
          when v_kind = 'dm' then (
            case
              when exists (
                select 1 from public.conversation_members cmo
                where cmo.conversation_id = m.conversation_id
                  and cmo.user_id <> v_uid and cmo.last_read_at >= m.created_at
              ) then 'read'
              when exists (
                select 1 from public.conversation_members cmo
                where cmo.conversation_id = m.conversation_id
                  and cmo.user_id <> v_uid and cmo.last_delivered_at >= m.created_at
              ) then 'delivered'
              else 'sent'
            end
          )
          else null
        end,
        -- ile osób odczytało (grupy)
        'read_by_count', case
          when m.sender_id = v_uid and v_kind = 'group' then (
            select count(*)::int from public.conversation_members cmo
            where cmo.conversation_id = m.conversation_id
              and cmo.user_id <> v_uid and cmo.last_read_at >= m.created_at
          )
          else null
        end
      ) as obj
    from picked m
    join public.profiles sp on sp.id = m.sender_id
    left join public.messages rm on rm.id = m.reply_to_id
    left join public.profiles rp on rp.id = rm.sender_id
    left join public.events ev on ev.id = m.event_id
  ) sub;

  return v_result;
end;
$$;

grant execute on function public.list_messages_v2(uuid, timestamptz, integer) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- M0. NAGŁÓWEK ROZMOWY (DM + grupa)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.get_conversation_meta(p_conversation_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_title text;
  v_photo text;
  v_other record;
  v_role text;
  v_count int;
begin
  if v_uid is null then return json_build_object('error', 'not_authenticated'); end if;

  select c.kind, c.title, c.photo_url into v_kind, v_title, v_photo
  from public.conversations c
  join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = v_uid
  where c.id = p_conversation_id;

  if v_kind is null then return json_build_object('error', 'not_found'); end if;

  v_role := public.conversation_member_role(p_conversation_id, v_uid);
  select count(*)::int into v_count
  from public.conversation_members where conversation_id = p_conversation_id;

  if v_kind = 'dm' then
    select p.id, p.nick, p.avatar_url, p.last_seen_at into v_other
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = p_conversation_id and cm.user_id <> v_uid
    limit 1;

    return json_build_object(
      'conversation_id', p_conversation_id,
      'kind', 'dm',
      'title', v_other.nick,
      'photo_url', v_other.avatar_url,
      'other_user_id', v_other.id,
      'other_is_online',
        v_other.last_seen_at is not null and v_other.last_seen_at > now() - interval '5 minutes',
      'my_role', v_role,
      'member_count', v_count
    );
  end if;

  return json_build_object(
    'conversation_id', p_conversation_id,
    'kind', v_kind,
    'title', v_title,
    'photo_url', v_photo,
    'other_user_id', null,
    'other_is_online', false,
    'my_role', v_role,
    'member_count', v_count
  );
end;
$$;

grant execute on function public.get_conversation_meta(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- M. WYSZUKIWANIE ROZMÓW
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.search_conversations(p_query text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with q as (select btrim(coalesce(p_query, '')) as term),
  base as (
    select c.id, c.kind, c.title, c.photo_url, c.updated_at
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
    where c.kind in ('dm', 'group')
  )
  select coalesce(json_agg(row order by row.updated_at desc), '[]'::json)
  from (
    select
      b.id as conversation_id,
      b.kind,
      b.updated_at,
      case when b.kind = 'group' then b.title else other_p.nick end as title,
      case when b.kind = 'group' then b.photo_url else other_p.avatar_url end as photo_url,
      case when b.kind = 'dm' then other_p.id end as other_user_id
    from base b
    cross join q
    left join lateral (
      select p.id, p.nick, p.avatar_url
      from public.conversation_members cmo
      join public.profiles p on p.id = cmo.user_id
      where cmo.conversation_id = b.id and cmo.user_id <> auth.uid()
      limit 1
    ) other_p on b.kind = 'dm'
    where q.term <> '' and (
      (b.kind = 'group' and b.title ilike '%' || q.term || '%')
      or (b.kind = 'dm' and other_p.nick ilike '%' || q.term || '%')
    )
  ) row;
$$;

grant execute on function public.search_conversations(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- N. PUSH: rozsyłanie powiadomień (grupy fan-out, pomijanie wiadomości systemowych)
-- ════════════════════════════════════════════════════════════════════════════
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
  v_kind text;
  v_title text;
  v_body text;
  v_group_title text;
begin
  if new.kind = 'system' then
    update public.conversations set updated_at = now() where id = new.conversation_id;
    return new;
  end if;

  select p.nick into v_sender_nick from public.profiles p where p.id = new.sender_id;

  v_body := case
    when new.body is not null and btrim(new.body) <> '' then left(new.body, 160)
    when new.kind = 'image' then '📷 Zdjęcie'
    when new.kind = 'video' then '🎥 Film'
    when new.kind = 'audio' then '🎤 Wiadomość głosowa'
    when new.kind = 'file' then '📎 Plik'
    else 'Nowa wiadomość'
  end;

  select tc.team_id into v_team_id from public.team_conversations tc
  where tc.conversation_id = new.conversation_id;
  select c.kind, c.title into v_kind, v_group_title from public.conversations c
  where c.id = new.conversation_id;

  if v_team_id is not null then
    v_title := coalesce(nullif(trim(v_sender_nick), ''), 'Czat drużyny');
    for v_recipient in
      select cm.user_id, p.expo_push_token from public.conversation_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id and cm.muted = false
    loop
      perform public.send_expo_push(v_recipient.expo_push_token, v_title, v_body,
        jsonb_build_object('type', 'team_message', 'team_id', v_team_id::text, 'conversation_id', new.conversation_id::text));
    end loop;
  elsif v_kind = 'group' then
    v_title := coalesce(nullif(trim(v_group_title), ''), 'Grupa');
    for v_recipient in
      select cm.user_id, p.expo_push_token from public.conversation_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id and cm.muted = false
    loop
      perform public.send_expo_push(v_recipient.expo_push_token, v_title,
        coalesce(nullif(trim(v_sender_nick), ''), '') || ': ' || v_body,
        jsonb_build_object('type', 'group_message', 'conversation_id', new.conversation_id::text));
    end loop;
  else
    select cm.user_id, p.expo_push_token, cm.muted into v_recipient
    from public.conversation_members cm join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = new.conversation_id and cm.user_id <> new.sender_id limit 1;
    if v_recipient.user_id is not null and v_recipient.muted = false then
      perform public.send_expo_push(v_recipient.expo_push_token,
        coalesce(nullif(trim(v_sender_nick), ''), 'Nowa wiadomość'), v_body,
        jsonb_build_object('type', 'dm', 'conversation_id', new.conversation_id::text));
    end if;
  end if;

  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

notify pgrst, 'reload schema';
