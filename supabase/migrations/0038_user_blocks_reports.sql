-- ═══════════════════════════════════════════════════════════════════════════
-- 0038 — Blokowanie i zgłaszanie użytkowników
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint user_reports_no_self check (reporter_id <> reported_user_id),
  constraint user_reports_reason_check check (
    reason in ('spam', 'harassment', 'inappropriate', 'other')
  ),
  constraint user_reports_status_check check (
    status in ('pending', 'reviewed', 'dismissed')
  )
);

create index if not exists user_reports_reported_idx on public.user_reports (reported_user_id);
create index if not exists user_reports_status_idx on public.user_reports (status, created_at desc);

alter table public.user_blocks enable row level security;
alter table public.user_reports enable row level security;

drop policy if exists user_blocks_select on public.user_blocks;
create policy user_blocks_select on public.user_blocks
  for select using (blocker_id = auth.uid());

drop policy if exists user_blocks_insert on public.user_blocks;
create policy user_blocks_insert on public.user_blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks
  for delete using (blocker_id = auth.uid());

drop policy if exists user_reports_insert on public.user_reports;
create policy user_reports_insert on public.user_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists user_reports_select_own on public.user_reports;
create policy user_reports_select_own on public.user_reports
  for select using (reporter_id = auth.uid());

drop policy if exists user_reports_select_admin on public.user_reports;
create policy user_reports_select_admin on public.user_reports
  for select using (public.is_app_admin());

-- ─── Helpers ───────────────────────────────────────────────────────────────

create or replace function public.i_blocked_user(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and exists (
      select 1 from public.user_blocks ub
      where ub.blocker_id = a and ub.blocked_id = b
    );
$$;

create or replace function public.users_are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and exists (
      select 1 from public.user_blocks ub
      where (ub.blocker_id = a and ub.blocked_id = b)
         or (ub.blocker_id = b and ub.blocked_id = a)
    );
$$;

grant execute on function public.i_blocked_user(uuid, uuid) to authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

-- ─── RPC: block / unblock / report ─────────────────────────────────────────

create or replace function public.block_user(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pair record;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    return 'invalid_user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'user_not_found';
  end if;

  select * into v_pair from public.ordered_user_pair(v_uid, p_user_id);

  delete from public.friendships
  where user_a = v_pair.user_a and user_b = v_pair.user_b;

  delete from public.follows
  where (follower_id = v_uid and following_id = p_user_id)
     or (follower_id = p_user_id and following_id = v_uid);

  delete from public.friend_requests
  where status = 'pending'
    and (
      (from_user_id = v_uid and to_user_id = p_user_id)
      or (from_user_id = p_user_id and to_user_id = v_uid)
    );

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  return 'blocked';
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
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
  if p_user_id is null or p_user_id = v_uid then
    return 'invalid_user';
  end if;

  delete from public.user_blocks
  where blocker_id = v_uid and blocked_id = p_user_id;

  if not found then
    return 'not_blocked';
  end if;

  return 'unblocked';
end;
$$;

create or replace function public.report_user(
  p_user_id uuid,
  p_reason text,
  p_details text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_details text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    return 'invalid_user';
  end if;
  if p_reason not in ('spam', 'harassment', 'inappropriate', 'other') then
    return 'invalid_reason';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'user_not_found';
  end if;

  v_details := nullif(trim(coalesce(p_details, '')), '');
  if v_details is not null and char_length(v_details) > 1000 then
    return 'invalid_details';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, reason, details)
  values (v_uid, p_user_id, p_reason, v_details);

  return 'reported';
end;
$$;

create or replace function public.list_blocked_users(p_max_rows integer default 100)
returns table (
  user_id uuid,
  nick text,
  avatar_url text,
  blocked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ub.blocked_id,
    p.nick,
    p.avatar_url,
    ub.created_at
  from public.user_blocks ub
  join public.profiles p on p.id = ub.blocked_id
  where ub.blocker_id = auth.uid()
  order by ub.created_at desc
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.report_user(uuid, text, text) to authenticated;
grant execute on function public.list_blocked_users(integer) to authenticated;

-- ─── Integracja z istniejącymi funkcjami ───────────────────────────────────

create or replace function public.can_message_user(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null
    and b is not null
    and a <> b
    and not public.users_are_blocked(a, b)
    and (
      public.have_dm_conversation(a, b)
      or public.are_friends(a, b)
      or public.events_together_count(a, b) > 0
    );
$$;

create or replace function public.follow_user(p_user_id uuid)
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
  if p_user_id is null or p_user_id = v_uid then
    return 'invalid_user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    return 'user_not_found';
  end if;
  if public.users_are_blocked(v_uid, p_user_id) then
    return 'blocked';
  end if;

  insert into public.follows (follower_id, following_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  return 'following';
end;
$$;

create or replace function public.send_friend_request(p_to_user_id uuid)
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
  if p_to_user_id is null or p_to_user_id = v_uid then
    return 'invalid_user';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_to_user_id) then
    return 'user_not_found';
  end if;
  if public.users_are_blocked(v_uid, p_to_user_id) then
    return 'blocked';
  end if;
  if public.are_friends(v_uid, p_to_user_id) then
    return 'already_friends';
  end if;

  if exists (
    select 1 from public.friend_requests fr
    where fr.status = 'pending'
      and (
        (fr.from_user_id = v_uid and fr.to_user_id = p_to_user_id)
        or (fr.from_user_id = p_to_user_id and fr.to_user_id = v_uid)
      )
  ) then
    return 'request_pending';
  end if;

  delete from public.friend_requests
  where status = 'rejected'
    and from_user_id = v_uid
    and to_user_id = p_to_user_id;

  insert into public.friend_requests (from_user_id, to_user_id, status)
  values (v_uid, p_to_user_id, 'pending');

  return 'sent';
end;
$$;

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

  if public.users_are_blocked(v_uid, p_user_id) then
    return json_build_object(
      'error', 'blocked',
      'i_blocked_them', public.i_blocked_user(v_uid, p_user_id)
    );
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

create or replace function public.search_profiles(p_query text, p_max_rows integer default 20)
returns table (
  user_id uuid,
  nick text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nick, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and p.nick is not null
    and length(trim(coalesce(p_query, ''))) >= 2
    and p.nick ilike '%' || trim(p_query) || '%'
    and not public.users_are_blocked(auth.uid(), p.id)
  order by p.nick
  limit least(greatest(coalesce(p_max_rows, 20), 1), 50);
$$;

create or replace function public.list_friends(p_max_rows integer default 100)
returns table (
  user_id uuid,
  nick text,
  avatar_url text,
  is_online boolean,
  friends_since timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when f.user_a = auth.uid() then f.user_b else f.user_a end as user_id,
    p.nick,
    p.avatar_url,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online,
    f.created_at as friends_since
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where (f.user_a = auth.uid() or f.user_b = auth.uid())
    and not public.users_are_blocked(
      auth.uid(),
      case when f.user_a = auth.uid() then f.user_b else f.user_a end
    )
  order by p.nick nulls last
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

create or replace function public.list_following(p_max_rows integer default 100)
returns table (
  user_id uuid,
  nick text,
  avatar_url text,
  is_online boolean,
  followed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nick,
    p.avatar_url,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online,
    fo.created_at as followed_at
  from public.follows fo
  join public.profiles p on p.id = fo.following_id
  where fo.follower_id = auth.uid()
    and not public.users_are_blocked(auth.uid(), fo.following_id)
  order by fo.created_at desc
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

create or replace function public.list_followers(p_max_rows integer default 100)
returns table (
  user_id uuid,
  nick text,
  avatar_url text,
  is_online boolean,
  followed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.nick,
    p.avatar_url,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online,
    fo.created_at as followed_at
  from public.follows fo
  join public.profiles p on p.id = fo.follower_id
  where fo.following_id = auth.uid()
    and not public.users_are_blocked(auth.uid(), fo.follower_id)
  order by fo.created_at desc
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

create or replace function public.list_friend_requests_incoming()
returns table (
  request_id uuid,
  from_user_id uuid,
  nick text,
  avatar_url text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    fr.id,
    fr.from_user_id,
    p.nick,
    p.avatar_url,
    fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user_id
  where fr.to_user_id = auth.uid()
    and fr.status = 'pending'
    and not public.users_are_blocked(auth.uid(), fr.from_user_id)
  order by fr.created_at desc;
$$;

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
    and not public.users_are_blocked(auth.uid(), po.author_id)
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

notify pgrst, 'reload schema';
