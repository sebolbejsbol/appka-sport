-- ═══════════════════════════════════════════════════════════════════════════
-- 0036 — Polubienia i komentarze pod postami
-- Kategoria: Społeczność  |  Typ: BASE  |  Wymaga: 0031
-- Plik: supabase/migrations/0036_post_likes_comments.sql
-- SQL Editor: 0036 — posty · polubienia i komentarze
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tabele ─────────────────────────────────────────────────────────────────

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint post_comments_body_length check (char_length(trim(body)) between 1 and 500)
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at asc);

alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- ─── Widoczność posta (jak w posts RLS) ─────────────────────────────────────

create or replace function public.can_view_post(p_post_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts po
    where po.id = p_post_id
      and p_user_id is not null
      and (
        po.author_id = p_user_id
        or exists (
          select 1
          from public.follows fo
          where fo.follower_id = p_user_id
            and fo.following_id = po.author_id
        )
      )
  );
$$;

grant execute on function public.can_view_post(uuid, uuid) to authenticated;

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select
  on public.post_likes for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));

drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select
  on public.post_comments for select to authenticated
  using (public.can_view_post(post_id, auth.uid()));

-- ─── Polubienia ─────────────────────────────────────────────────────────────

create or replace function public.toggle_post_like(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_nick text;
  v_token text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if not public.can_view_post(p_post_id, v_uid) then
    return 'forbidden';
  end if;

  select po.author_id into v_author
  from public.posts po
  where po.id = p_post_id;

  if not found then
    return 'not_found';
  end if;

  if exists (
    select 1 from public.post_likes pl
    where pl.post_id = p_post_id and pl.user_id = v_uid
  ) then
    delete from public.post_likes
    where post_id = p_post_id and user_id = v_uid;
    return 'unliked';
  end if;

  insert into public.post_likes (post_id, user_id)
  values (p_post_id, v_uid);

  if v_author <> v_uid then
    select liker.nick, author.expo_push_token into v_nick, v_token
    from public.profiles liker
    join public.profiles author on author.id = v_author
    where liker.id = v_uid;

    perform public.send_expo_push(
      v_token,
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' polubił Twój post',
      'Zobacz w aktualnościach',
      jsonb_build_object('type', 'post_like', 'post_id', p_post_id::text)
    );
  end if;

  return 'liked';
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- ─── Komentarze ─────────────────────────────────────────────────────────────

create or replace function public.create_post_comment(p_post_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id uuid;
  v_author uuid;
  v_nick text;
  v_token text;
  v_preview text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_view_post(p_post_id, v_uid) then
    raise exception 'forbidden';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'invalid_body';
  end if;

  select po.author_id into v_author from public.posts po where po.id = p_post_id;
  if not found then
    raise exception 'not_found';
  end if;

  insert into public.post_comments (post_id, author_id, body)
  values (p_post_id, v_uid, v_body)
  returning id into v_id;

  if v_author <> v_uid then
    select commenter.nick, author.expo_push_token into v_nick, v_token
    from public.profiles commenter
    join public.profiles author on author.id = v_author
    where commenter.id = v_uid;

    v_preview := v_body;
    if char_length(v_preview) > 80 then
      v_preview := left(v_preview, 77) || '…';
    end if;

    perform public.send_expo_push(
      v_token,
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' skomentował Twój post',
      v_preview,
      jsonb_build_object('type', 'post_comment', 'post_id', p_post_id::text)
    );
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_post_comment(uuid, text) to authenticated;

create or replace function public.delete_post_comment(p_comment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post_author uuid;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select po.author_id into v_post_author
  from public.post_comments pc
  join public.posts po on po.id = pc.post_id
  where pc.id = p_comment_id and pc.author_id = v_uid;

  if found then
    delete from public.post_comments where id = p_comment_id;
    return 'deleted';
  end if;

  delete from public.post_comments pc
  using public.posts po
  where pc.id = p_comment_id
    and po.id = pc.post_id
    and po.author_id = v_uid;

  if found then
    return 'deleted';
  end if;

  return 'forbidden';
end;
$$;

grant execute on function public.delete_post_comment(uuid) to authenticated;

create or replace function public.list_post_comments(
  p_post_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  comment_id uuid,
  author_id uuid,
  author_nick text,
  author_avatar_url text,
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
    pc.id as comment_id,
    pc.author_id,
    p.nick as author_nick,
    p.avatar_url as author_avatar_url,
    pc.body,
    pc.created_at,
    (pc.author_id = auth.uid()) as is_mine
  from public.post_comments pc
  join public.profiles p on p.id = pc.author_id
  where public.can_view_post(p_post_id, auth.uid())
    and pc.post_id = p_post_id
    and (p_before is null or pc.created_at < p_before)
  order by pc.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

grant execute on function public.list_post_comments(uuid, integer, timestamptz) to authenticated;

-- ─── Szczegóły posta ────────────────────────────────────────────────────────

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
    'body', po.body,
    'created_at', po.created_at,
    'is_mine', (po.author_id = auth.uid()),
    'like_count', (select count(*)::int from public.post_likes pl where pl.post_id = po.id),
    'comment_count', (select count(*)::int from public.post_comments pc where pc.post_id = po.id),
    'is_liked', exists(
      select 1 from public.post_likes pl2
      where pl2.post_id = po.id and pl2.user_id = auth.uid()
    )
  )
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where po.id = p_post_id
    and public.can_view_post(po.id, auth.uid());
$$;

grant execute on function public.get_post_detail(uuid) to authenticated;

-- ─── Aktualizacja list feed / profil ────────────────────────────────────────

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
  like_count bigint,
  comment_count bigint,
  is_liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    po.id as post_id,
    po.author_id,
    p.nick as author_nick,
    p.avatar_url as author_avatar_url,
    public.are_friends(auth.uid(), po.author_id) as author_is_friend,
    po.body,
    po.created_at,
    (po.author_id = auth.uid()) as is_mine,
    (select count(*) from public.post_likes pl where pl.post_id = po.id) as like_count,
    (select count(*) from public.post_comments pc where pc.post_id = po.id) as comment_count,
    exists(
      select 1 from public.post_likes pl2
      where pl2.post_id = po.id and pl2.user_id = auth.uid()
    ) as is_liked
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where auth.uid() is not null
    and (
      po.author_id = auth.uid()
      or exists (
        select 1
        from public.follows fo
        where fo.follower_id = auth.uid()
          and fo.following_id = po.author_id
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
  like_count bigint,
  comment_count bigint,
  is_liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    po.id as post_id,
    po.author_id,
    p.nick as author_nick,
    p.avatar_url as author_avatar_url,
    po.body,
    po.created_at,
    (po.author_id = auth.uid()) as is_mine,
    (select count(*) from public.post_likes pl where pl.post_id = po.id) as like_count,
    (select count(*) from public.post_comments pc where pc.post_id = po.id) as comment_count,
    exists(
      select 1 from public.post_likes pl2
      where pl2.post_id = po.id and pl2.user_id = auth.uid()
    ) as is_liked
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
