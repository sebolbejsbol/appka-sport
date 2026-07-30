-- Migracja 0031: posty + feed od obserwowanych
-- Wymaga: 0026–0030.
--
-- Model:
--   Obserwuję → posty w Aktualnościach (feed)
--   Znajomi → osobna relacja (DM bez barier)
--   Wiadomości → znajomi | wspólny mecz | istniejący czat (bez zmian)

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint posts_body_length check (char_length(trim(body)) between 1 and 2000)
);

create index if not exists posts_author_created_idx
  on public.posts (author_id, created_at desc);

create index if not exists posts_created_idx
  on public.posts (created_at desc);

alter table public.posts enable row level security;

-- Odczyt: własne posty lub posty osób, które obserwujesz
create policy posts_select_followed_or_own
  on public.posts
  for select
  to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.follows fo
      where fo.follower_id = auth.uid()
        and fo.following_id = posts.author_id
    )
  );

create policy posts_insert_own
  on public.posts
  for insert
  to authenticated
  with check (author_id = auth.uid());

create policy posts_delete_own
  on public.posts
  for delete
  to authenticated
  using (author_id = auth.uid());

-- Nowy post
create or replace function public.create_post(p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then
    raise exception 'invalid_body';
  end if;

  insert into public.posts (author_id, body)
  values (v_uid, v_body)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_post(text) to authenticated;

-- Feed: posty od obserwowanych + własne
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
  is_mine boolean
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
    (po.author_id = auth.uid()) as is_mine
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

-- Posty na profilu użytkownika (widoczne dla zalogowanych)
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
  is_mine boolean
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
    (po.author_id = auth.uid()) as is_mine
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where auth.uid() is not null
    and po.author_id = p_user_id
    and (p_before is null or po.created_at < p_before)
  order by po.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

grant execute on function public.list_user_posts(uuid, integer, timestamptz) to authenticated;

-- Przywróć licznik „Obserwuję” w profilu
create or replace function public.get_public_profile(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile record;
  v_stats record;
  v_friends bigint;
  v_followers bigint;
  v_following bigint;
  v_events_together bigint;
  v_is_friend boolean;
  v_is_following boolean;
  v_is_followed_by boolean;
  v_can_message boolean;
  v_request_status text;
  v_online boolean;
begin
  if v_uid is null then
    return json_build_object('error', 'not_authenticated');
  end if;

  select p.id, p.nick, p.avatar_url, p.last_seen_at
  into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if v_profile.id is null then
    return json_build_object('error', 'not_found');
  end if;

  select s.events_played, s.avg_rating into v_stats
  from public.player_social_stats(p_user_id) s;

  select count(*)::bigint into v_friends
  from public.friendships f
  where f.user_a = p_user_id or f.user_b = p_user_id;

  select count(*)::bigint into v_followers
  from public.follows fo
  where fo.following_id = p_user_id;

  select count(*)::bigint into v_following
  from public.follows fo
  where fo.follower_id = p_user_id;

  v_is_friend := public.are_friends(v_uid, p_user_id);

  v_is_following := exists (
    select 1 from public.follows fo
    where fo.follower_id = v_uid and fo.following_id = p_user_id
  );

  v_is_followed_by := exists (
    select 1 from public.follows fo
    where fo.follower_id = p_user_id and fo.following_id = v_uid
  );

  v_events_together := public.events_together_count(v_uid, p_user_id);
  v_can_message := public.can_message_user(v_uid, p_user_id);

  v_request_status := 'none';
  if not v_is_friend then
    if exists (
      select 1 from public.friend_requests fr
      where fr.status = 'pending' and fr.from_user_id = v_uid and fr.to_user_id = p_user_id
    ) then
      v_request_status := 'sent';
    elsif exists (
      select 1 from public.friend_requests fr
      where fr.status = 'pending' and fr.from_user_id = p_user_id and fr.to_user_id = v_uid
    ) then
      v_request_status := 'received';
    end if;
  end if;

  v_online := v_profile.last_seen_at is not null
    and v_profile.last_seen_at > now() - interval '5 minutes';

  return json_build_object(
    'id', v_profile.id,
    'nick', v_profile.nick,
    'avatar_url', v_profile.avatar_url,
    'friend_count', v_friends,
    'follower_count', v_followers,
    'following_count', v_following,
    'events_played', coalesce(v_stats.events_played, 0),
    'events_together', coalesce(v_events_together, 0),
    'avg_rating', v_stats.avg_rating,
    'is_friend', v_is_friend,
    'is_following', v_is_following,
    'is_followed_by', v_is_followed_by,
    'can_message', v_can_message,
    'friend_request_status', v_request_status,
    'is_online', v_online,
    'is_self', v_uid = p_user_id
  );
end;
$$;

notify pgrst, 'reload schema';
