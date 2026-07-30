-- Migracja 0029: spójny model społecznościowy (sport + IG)
-- Wymaga: 0026, 0027, 0028.
-- Znajomi = wzajemne obserwowanie.
-- Nowy czat: wzajemny follow LUB wspólny rozegrany event LUB istniejąca rozmowa.

-- Ile eventów rozegrali razem (oba meldunki na tym samym evencie)
create or replace function public.events_together_count(a uuid, b uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct ci1.event_id)::bigint
  from public.event_check_ins ci1
  inner join public.event_check_ins ci2
    on ci2.event_id = ci1.event_id
   and ci2.user_id = b
  where ci1.user_id = a
    and a is not null
    and b is not null
    and a <> b;
$$;

grant execute on function public.events_together_count(uuid, uuid) to authenticated;

-- Jedna reguła: kiedy można pisać (nowy czat lub kontynuacja)
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
      or public.mutual_follow_exists(a, b)
      or public.events_together_count(a, b) > 0
    );
$$;

grant execute on function public.can_message_user(uuid, uuid) to authenticated;

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

  if not public.can_message_user(v_uid, p_other_user_id) then
    raise exception 'cannot_message';
  end if;

  insert into public.conversations default values returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid), (v_conv, p_other_user_id);

  insert into public.dm_conversations (user_a, user_b, conversation_id)
  values (v_low, v_high, v_conv);

  return v_conv;
end;
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
  v_following bigint;
  v_events_together bigint;
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
  v_events_together := public.events_together_count(v_uid, p_user_id);
  v_can_message := public.can_message_user(v_uid, p_user_id);

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
    'friend_request_status', 'none',
    'is_online', v_online,
    'is_self', v_uid = p_user_id
  );
end;
$$;

notify pgrst, 'reload schema';
