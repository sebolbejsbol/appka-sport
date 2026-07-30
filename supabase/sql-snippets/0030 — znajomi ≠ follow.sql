-- ═══════════════════════════════════════════════════════════════════════════
-- 0030 — Znajomi ≠ obserwowanie
-- Kategoria: Społeczność  |  Typ: BASE  |  Wymaga: 0028, 0029
-- Plik: supabase/migrations/0030_friends_not_follows.sql
-- SQL Editor: 0030 — znajomi ≠ follow
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

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

  insert into public.follows (follower_id, following_id)
  values (v_uid, p_user_id)
  on conflict do nothing;

  return 'following';
end;
$$;

-- Przestań obserwować (czat zostaje)
create or replace function public.unfollow_user(p_user_id uuid)
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

  delete from public.follows
  where follower_id = v_uid and following_id = p_user_id;

  if not found then
    return 'not_following';
  end if;

  return 'unfollowed';
end;
$$;

-- Usuń znajomego (tylko relacja znajomości)
create or replace function public.remove_friend(p_friend_id uuid)
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

  select * into v_pair from public.ordered_user_pair(v_uid, p_friend_id);

  delete from public.friendships
  where user_a = v_pair.user_a and user_b = v_pair.user_b;

  if not found then
    return 'not_friends';
  end if;

  return 'removed';
end;
$$;

-- Kiedy można pisać
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
    and (
      public.have_dm_conversation(a, b)
      or public.are_friends(a, b)
      or public.events_together_count(a, b) > 0
    );
$$;

-- Profil publiczny
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
    'following_count', 0,
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
