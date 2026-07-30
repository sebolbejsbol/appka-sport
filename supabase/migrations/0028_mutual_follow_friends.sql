-- Migracja 0028: znajomi = wzajemne obserwowanie (jak IG)
-- Wymaga: 0026, 0027.
-- Uruchom w Supabase: SQL Editor → Run.

-- Czy oboje się obserwują
create or replace function public.mutual_follow_exists(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows f1
    join public.follows f2
      on f1.follower_id = f2.following_id
     and f1.following_id = f2.follower_id
    where f1.follower_id = a and f1.following_id = b
  );
$$;

grant execute on function public.mutual_follow_exists(uuid, uuid) to authenticated;

-- Synchronizuj wpis w friendships z wzajemnym obserwowaniem
create or replace function public.sync_friendship_from_mutual_follow(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
begin
  if a is null or b is null or a = b then
    return;
  end if;

  select * into v_pair from public.ordered_user_pair(a, b);

  if public.mutual_follow_exists(a, b) then
    insert into public.friendships (user_a, user_b)
    values (v_pair.user_a, v_pair.user_b)
    on conflict do nothing;
    return;
  end if;

  delete from public.friendships
  where user_a = v_pair.user_a and user_b = v_pair.user_b;
end;
$$;

grant execute on function public.sync_friendship_from_mutual_follow(uuid, uuid) to authenticated;

-- Czy istnieje już rozmowa DM (np. po cofnięciu obserwowania)
create or replace function public.have_dm_conversation(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_conversations d
    where d.user_a = least(a, b) and d.user_b = greatest(a, b)
  );
$$;

grant execute on function public.have_dm_conversation(uuid, uuid) to authenticated;

-- Obserwuj — przy wzajemnym follow automatycznie znajomi
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

  perform public.sync_friendship_from_mutual_follow(v_uid, p_user_id);

  return 'following';
end;
$$;

-- Przestań obserwować — znajomość znika, czat zostaje
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

  perform public.sync_friendship_from_mutual_follow(v_uid, p_user_id);

  return 'unfollowed';
end;
$$;

-- Usuń znajomego = przestań obserwować (jednostronnie)
create or replace function public.remove_friend(p_friend_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.unfollow_user(p_friend_id);
end;
$$;

-- Nowa rozmowa tylko przy wzajemnym obserwowaniu; istniejący czat zawsze dostępny
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

  if not public.mutual_follow_exists(v_uid, p_other_user_id) then
    raise exception 'mutual_follow_required';
  end if;

  insert into public.conversations default values returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid), (v_conv, p_other_user_id);

  insert into public.dm_conversations (user_a, user_b, conversation_id)
  values (v_low, v_high, v_conv);

  return v_conv;
end;
$$;

-- Profil publiczny — znajomi = wzajemne obserwowanie
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
  v_is_friend boolean;
  v_is_following boolean;
  v_is_followed_by boolean;
  v_can_message boolean;
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

  v_is_following := exists (
    select 1 from public.follows fo
    where fo.follower_id = v_uid and fo.following_id = p_user_id
  );

  v_is_followed_by := exists (
    select 1 from public.follows fo
    where fo.follower_id = p_user_id and fo.following_id = v_uid
  );

  v_is_friend := public.mutual_follow_exists(v_uid, p_user_id);

  v_can_message := v_is_friend
    or public.have_dm_conversation(v_uid, p_user_id);

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
    'avg_rating', v_stats.avg_rating,
    'is_friend', v_is_friend,
    'is_following', v_is_following,
    'is_followed_by', v_is_followed_by,
    'can_message', v_can_message,
    'friend_request_status', 'none',
    'is_online', v_online,
    'is_self', v_uid = p_user_id
  );
end;
$$;

-- Istniejące wzajemne obserwowania → znajomi
insert into public.friendships (user_a, user_b)
select distinct
  least(f1.follower_id, f1.following_id),
  greatest(f1.follower_id, f1.following_id)
from public.follows f1
join public.follows f2
  on f1.follower_id = f2.following_id
 and f1.following_id = f2.follower_id
where f1.follower_id <> f1.following_id
on conflict do nothing;

notify pgrst, 'reload schema';
