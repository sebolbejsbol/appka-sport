-- ═══════════════════════════════════════════════════════════════════════════
-- 0037 — Posty: zdjęcia, wideo, repost, oznaczenia (@nick)
-- Kategoria: Społeczność  |  Typ: BASE  |  Wymaga: 0031, 0036
-- Plik: supabase/migrations/0037_posts_media_reposts_mentions.sql
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.posts
  add column if not exists repost_of_id uuid references public.posts (id) on delete set null;

create index if not exists posts_repost_of_idx on public.posts (repost_of_id);

alter table public.posts alter column body drop not null;
alter table public.posts alter column body set default '';

alter table public.posts drop constraint if exists posts_body_length;

alter table public.posts
  add constraint posts_body_length check (char_length(coalesce(body, '')) <= 2000);

create unique index if not exists posts_one_repost_per_user
  on public.posts (author_id, repost_of_id)
  where repost_of_id is not null;

-- ─── Media ──────────────────────────────────────────────────────────────────

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  storage_path text not null,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_idx on public.post_media (post_id, sort_order);

alter table public.post_media enable row level security;

drop policy if exists post_media_select on public.post_media;
create policy post_media_select
  on public.post_media for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));

-- ─── Oznaczenia użytkowników ────────────────────────────────────────────────

create table if not exists public.post_mentions (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (post_id, user_id)
);

create index if not exists post_mentions_user_idx on public.post_mentions (user_id);

alter table public.post_mentions enable row level security;

drop policy if exists post_mentions_select on public.post_mentions;
create policy post_mentions_select
  on public.post_mentions for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));

-- ─── Storage: post-media ────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload post media" on storage.objects;
create policy "Users upload post media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own post media" on storage.objects;
create policy "Users update own post media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public read post media" on storage.objects;
create policy "Public read post media"
  on storage.objects for select to authenticated
  using (bucket_id = 'post-media');

-- ─── Helpers ──────────────────────────────────────────────────────────────────

create or replace function public.post_media_json(p_post_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'storage_path', pm.storage_path,
        'media_type', pm.media_type,
        'mime_type', pm.mime_type,
        'sort_order', pm.sort_order
      )
      order by pm.sort_order asc, pm.created_at asc
    ),
    '[]'::json
  )
  from public.post_media pm
  where pm.post_id = p_post_id;
$$;

create or replace function public.post_mentions_json(p_post_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'user_id', m.user_id,
        'nick', p.nick
      )
      order by p.nick asc
    ),
    '[]'::json
  )
  from public.post_mentions m
  join public.profiles p on p.id = m.user_id
  where m.post_id = p_post_id;
$$;

create or replace function public.post_summary_json(p_post_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case
    when po.id is null then null
    when not public.can_view_post(po.id, auth.uid()) then json_build_object('unavailable', true)
    else json_build_object(
      'post_id', po.id,
      'author_id', po.author_id,
      'author_nick', pr.nick,
      'author_avatar_url', pr.avatar_url,
      'body', coalesce(po.body, ''),
      'created_at', po.created_at,
      'media', public.post_media_json(po.id),
      'mentions', public.post_mentions_json(po.id)
    )
  end
  from public.posts po
  left join public.profiles pr on pr.id = po.author_id
  where po.id = p_post_id;
$$;

-- ─── Oznaczenia użytkowników ────────────────────────────────────────────────

create or replace function public.sync_post_mentions(p_post_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text;
  v_mentioned uuid;
  v_token text;
  v_author_nick text;
begin
  delete from public.post_mentions where post_id = p_post_id;

  select nick into v_author_nick from public.profiles where id = v_uid;

  for v_nick in
    select distinct lower(m[1])
    from regexp_matches(coalesce(p_body, ''), '@([A-Za-z0-9_]{2,24})', 'g') as m
  loop
    select p.id into v_mentioned
    from public.profiles p
    where lower(trim(p.nick)) = v_nick
    limit 1;

    if v_mentioned is not null then
      insert into public.post_mentions (post_id, user_id)
      values (p_post_id, v_mentioned)
      on conflict do nothing;

      if v_mentioned <> v_uid then
        select expo_push_token into v_token
        from public.profiles
        where id = v_mentioned;

        perform public.send_expo_push(
          v_token,
          coalesce(nullif(trim(v_author_nick), ''), 'Gracz') || ' oznaczył Cię w poście',
          left(coalesce(p_body, ''), 80),
          jsonb_build_object('type', 'post_mention', 'post_id', p_post_id::text)
        );
      end if;
    end if;
  end loop;
end;
$$;

-- ─── Tworzenie posta (zastępuje starą wersję) ───────────────────────────────

drop function if exists public.create_post(text);

create or replace function public.create_post(
  p_body text default '',
  p_media jsonb default '[]'::jsonb,
  p_repost_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id uuid;
  v_item jsonb;
  v_path text;
  v_type text;
  v_mime text;
  v_sort integer := 0;
  v_media_count integer := 0;
  v_video_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_body := coalesce(p_body, '');

  if char_length(v_body) > 2000 then
    raise exception 'invalid_body';
  end if;

  if p_repost_of is not null then
    if not public.can_view_post(p_repost_of, v_uid) then
      raise exception 'forbidden';
    end if;
    if exists (
      select 1 from public.posts
      where author_id = v_uid and repost_of_id = p_repost_of
    ) then
      raise exception 'already_reposted';
    end if;
  end if;

  if p_repost_of is null then
    if jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0
      and char_length(trim(v_body)) < 1
    then
      raise exception 'invalid_body';
    end if;
  end if;

  insert into public.posts (author_id, body, repost_of_id)
  values (v_uid, v_body, p_repost_of)
  returning id into v_id;

  if p_repost_of is null and jsonb_typeof(p_media) = 'array' then
    for v_item in select value from jsonb_array_elements(p_media)
    loop
      v_path := nullif(trim(v_item ->> 'path'), '');
      v_type := v_item ->> 'media_type';
      v_mime := v_item ->> 'mime_type';

      if v_path is null or v_type not in ('image', 'video') then
        continue;
      end if;
      if (split_part(v_path, '/', 1)) <> v_uid::text then
        raise exception 'invalid_media_path';
      end if;

      v_media_count := v_media_count + 1;
      if v_type = 'video' then
        v_video_count := v_video_count + 1;
      end if;
      if v_media_count > 4 or v_video_count > 1 then
        raise exception 'too_many_media';
      end if;

      insert into public.post_media (post_id, storage_path, media_type, mime_type, sort_order)
      values (v_id, v_path, v_type, v_mime, v_sort);
      v_sort := v_sort + 1;
    end loop;
  end if;

  if char_length(trim(v_body)) > 0 then
    perform public.sync_post_mentions(v_id, v_body);
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_post(text, jsonb, uuid) to authenticated;

create or replace function public.repost_post(
  p_original_id uuid,
  p_quote text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_post(coalesce(p_quote, ''), '[]'::jsonb, p_original_id);
exception
  when others then
    raise;
end;
$$;

grant execute on function public.repost_post(uuid, text) to authenticated;

-- ─── Aktualizacja list i szczegółów ─────────────────────────────────────────

drop function if exists public.get_post_detail(uuid);

create or replace function public.get_post_detail(p_post_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'post_id', po.id,
    'author_id', po.author_id,
    'author_nick', p.nick,
    'author_avatar_url', p.avatar_url,
    'author_is_friend', public.are_friends(auth.uid(), po.author_id),
    'body', coalesce(po.body, ''),
    'created_at', po.created_at,
    'is_mine', (po.author_id = auth.uid()),
    'repost_of_id', po.repost_of_id,
    'repost_original', case when po.repost_of_id is not null then public.post_summary_json(po.repost_of_id) else null end,
    'media', public.post_media_json(po.id),
    'mentions', public.post_mentions_json(po.id),
    'like_count', (select count(*)::int from public.post_likes pl where pl.post_id = po.id),
    'comment_count', (select count(*)::int from public.post_comments pc where pc.post_id = po.id),
    'is_liked', exists(
      select 1 from public.post_likes pl2
      where pl2.post_id = po.id and pl2.user_id = auth.uid()
    ),
    'is_reposted', case
      when po.repost_of_id is not null then false
      else exists(
        select 1 from public.posts rp
        where rp.author_id = auth.uid() and rp.repost_of_id = po.id
      )
    end
  )
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where po.id = p_post_id
    and public.can_view_post(po.id, auth.uid());
$$;

grant execute on function public.get_post_detail(uuid) to authenticated;

drop function if exists public.list_feed_posts(integer, timestamptz);

create or replace function public.list_feed_posts(
  p_limit integer default 30,
  p_before timestamptz default null
)
returns table (
  post_id uuid,
  author_id uuid,
  author_nick text,
  author_avatar_url text,
  author_is_friend boolean,
  body text,
  created_at timestamptz,
  is_mine boolean,
  repost_of_id uuid,
  repost_original json,
  media json,
  mentions json,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_reposted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    po.id,
    po.author_id,
    p.nick,
    p.avatar_url,
    public.are_friends(auth.uid(), po.author_id),
    coalesce(po.body, ''),
    po.created_at,
    (po.author_id = auth.uid()),
    po.repost_of_id,
    case when po.repost_of_id is not null then public.post_summary_json(po.repost_of_id) else null end,
    public.post_media_json(po.id),
    public.post_mentions_json(po.id),
    (select count(*) from public.post_likes pl where pl.post_id = po.id),
    (select count(*) from public.post_comments pc where pc.post_id = po.id),
    exists(select 1 from public.post_likes pl2 where pl2.post_id = po.id and pl2.user_id = auth.uid()),
    case
      when po.repost_of_id is not null then false
      else exists(select 1 from public.posts rp where rp.author_id = auth.uid() and rp.repost_of_id = po.id)
    end
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where auth.uid() is not null
    and (
      po.author_id = auth.uid()
      or exists (
        select 1 from public.follows fo
        where fo.follower_id = auth.uid() and fo.following_id = po.author_id
      )
    )
    and (p_before is null or po.created_at < p_before)
  order by po.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

grant execute on function public.list_feed_posts(integer, timestamptz) to authenticated;

drop function if exists public.list_user_posts(uuid, integer, timestamptz);

create or replace function public.list_user_posts(
  p_user_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null
)
returns table (
  post_id uuid,
  author_id uuid,
  author_nick text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  is_mine boolean,
  repost_of_id uuid,
  repost_original json,
  media json,
  mentions json,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_reposted boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    po.id,
    po.author_id,
    p.nick,
    p.avatar_url,
    coalesce(po.body, ''),
    po.created_at,
    (po.author_id = auth.uid()),
    po.repost_of_id,
    case when po.repost_of_id is not null then public.post_summary_json(po.repost_of_id) else null end,
    public.post_media_json(po.id),
    public.post_mentions_json(po.id),
    (select count(*) from public.post_likes pl where pl.post_id = po.id),
    (select count(*) from public.post_comments pc where pc.post_id = po.id),
    exists(select 1 from public.post_likes pl2 where pl2.post_id = po.id and pl2.user_id = auth.uid()),
    case
      when po.repost_of_id is not null then false
      else exists(select 1 from public.posts rp where rp.author_id = auth.uid() and rp.repost_of_id = po.id)
    end
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where auth.uid() is not null
    and po.author_id = p_user_id
    and (p_before is null or po.created_at < p_before)
  order by po.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

grant execute on function public.list_user_posts(uuid, integer, timestamptz) to authenticated;

notify pgrst, 'reload schema';
