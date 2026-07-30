-- Migracja 0027: wiadomości prywatne 1:1 (faza 2 społeczności)
-- Uruchom w Supabase: SQL Editor → Run.
-- Wymaga: 0026 (last_seen_at, profiles).

-- Rozmowy
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversations is 'Prywatne rozmowy 1:1.';

-- Indeks par DM (jedna rozmowa na parę użytkowników)
create table if not exists public.dm_conversations (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  primary key (user_a, user_b),
  constraint dm_conversations_ordered check (user_a < user_b),
  constraint dm_conversations_unique_conv unique (conversation_id)
);

-- Uczestnicy rozmowy
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- Wiadomości tekstowe
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_length check (char_length(body) >= 1 and char_length(body) <= 2000)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.dm_conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

-- RLS: widać tylko własne rozmowy
drop policy if exists "Members see own conversations" on public.conversations;
create policy "Members see own conversations"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Members see dm index" on public.dm_conversations;
create policy "Members see dm index"
  on public.dm_conversations for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

drop policy if exists "Members see conversation members" on public.conversation_members;
create policy "Members see conversation members"
  on public.conversation_members for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_members.conversation_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Realtime (nowe wiadomości na żywo)
alter table public.messages replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end;
$$;

-- Otwórz / utwórz rozmowę DM
create or replace function public.open_dm_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_uid then
    raise exception 'invalid_user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_other_user_id) then
    raise exception 'user_not_found';
  end if;

  v_low := least(v_uid, p_other_user_id);
  v_high := greatest(v_uid, p_other_user_id);

  select d.conversation_id into v_conv
  from public.dm_conversations d
  where d.user_a = v_low and d.user_b = v_high;

  if v_conv is not null then
    return v_conv;
  end if;

  insert into public.conversations default values returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid), (v_conv, p_other_user_id);

  insert into public.dm_conversations (user_a, user_b, conversation_id)
  values (v_low, v_high, v_conv);

  return v_conv;
end;
$$;

grant execute on function public.open_dm_conversation(uuid) to authenticated;

-- Lista rozmów (ostatnia wiadomość, nieprzeczytane)
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
  with my_convs as (
    select cm.conversation_id
    from public.conversation_members cm
    where cm.user_id = auth.uid()
  ),
  last_msg as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.body,
      m.created_at,
      m.sender_id
    from public.messages m
    inner join my_convs mc on mc.conversation_id = m.conversation_id
    order by m.conversation_id, m.created_at desc
  ),
  unread as (
    select
      m.conversation_id,
      count(*)::bigint as cnt
    from public.messages m
    inner join public.conversation_members cm
      on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
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
  inner join my_convs mc on mc.conversation_id = c.id
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

grant execute on function public.list_conversations(integer) to authenticated;

-- Wiadomości w rozmowie
create or replace function public.list_messages(
  p_conversation_id uuid,
  p_max_rows integer default 80
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.sender_id,
    m.body,
    m.created_at,
    (m.sender_id = auth.uid()) as is_mine
  from public.messages m
  where m.conversation_id = p_conversation_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid()
    )
  order by m.created_at asc
  limit least(greatest(coalesce(p_max_rows, 80), 1), 200);
$$;

grant execute on function public.list_messages(uuid, integer) to authenticated;

-- Wyślij wiadomość
create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := nullif(trim(p_body), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if v_body is null or char_length(v_body) > 2000 then
    raise exception 'invalid_body';
  end if;
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_uid
  ) then
    raise exception 'not_member';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, v_uid, v_body)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.send_message(uuid, text) to authenticated;

-- Oznacz jako przeczytane
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- Meta rozmowy (nagłówek czatu)
create or replace function public.get_conversation_header(p_conversation_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_other record;
  v_my_last_read timestamptz;
  v_other_last_read timestamptz;
begin
  if v_uid is null then
    return json_build_object('error', 'not_authenticated');
  end if;

  select p.id, p.nick, p.avatar_url, p.last_seen_at
  into v_other
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and cm.user_id <> v_uid;

  if v_other.id is null then
    return json_build_object('error', 'not_found');
  end if;

  select cm.last_read_at into v_my_last_read
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = v_uid;

  select cm.last_read_at into v_other_last_read
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id and cm.user_id = v_other.id;

  return json_build_object(
    'conversation_id', p_conversation_id,
    'other_user_id', v_other.id,
    'other_nick', v_other.nick,
    'other_avatar_url', v_other.avatar_url,
    'other_is_online',
      v_other.last_seen_at is not null
      and v_other.last_seen_at > now() - interval '5 minutes',
    'other_last_read_at', v_other_last_read
  );
end;
$$;

grant execute on function public.get_conversation_header(uuid) to authenticated;

-- Push przy nowej wiadomości
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient_id uuid;
  v_token text;
  v_sender_nick text;
begin
  select cm.user_id into v_recipient_id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id <> new.sender_id
  limit 1;

  if v_recipient_id is null then
    return new;
  end if;

  select p.expo_push_token into v_token
  from public.profiles p
  where p.id = v_recipient_id;

  select p.nick into v_sender_nick
  from public.profiles p
  where p.id = new.sender_id;

  perform public.send_expo_push(
    v_token,
    coalesce(nullif(trim(v_sender_nick), ''), 'Nowa wiadomość'),
    left(new.body, 160),
    jsonb_build_object(
      'type', 'dm',
      'conversation_id', new.conversation_id::text
    )
  );

  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_notify_push on public.messages;
create trigger messages_notify_push
  after insert on public.messages
  for each row execute function public.notify_on_new_message();

notify pgrst, 'reload schema';
