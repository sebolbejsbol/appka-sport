-- ═══════════════════════════════════════════════════════════════════════════
-- 0026 — Social graph (follow, profil publiczny)
-- Kategoria: Społeczność  |  Typ: BASE  |  Wymaga: 0001
-- Plik: supabase/migrations/0026_social_graph.sql
-- SQL Editor: 0026 — social graph (follow)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is 'Ostatnia aktywność w apce — do statusu online.';

-- Zaproszenia do znajomych
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (from_user_id <> to_user_id),
  constraint friend_requests_unique_pair unique (from_user_id, to_user_id)
);

create index if not exists friend_requests_to_pending_idx
  on public.friend_requests (to_user_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "Users see own friend requests" on public.friend_requests;
create policy "Users see own friend requests"
  on public.friend_requests for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

-- Przyjaźnie (para uporządkowana: user_a < user_b)
create table if not exists public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a);
create index if not exists friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

drop policy if exists "Users see own friendships" on public.friendships;
create policy "Users see own friendships"
  on public.friendships for select
  to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- Obserwowanie (asymetryczne)
create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "Follows viewable by authenticated" on public.follows;
create policy "Follows viewable by authenticated"
  on public.follows for select
  to authenticated
  using (true);

-- Helper: uporządkowana para UUID
create or replace function public.ordered_user_pair(a uuid, b uuid)
returns table (user_a uuid, user_b uuid)
language sql
immutable
as $$
  select least(a, b), greatest(a, b);
$$;

-- Czy są znajomymi
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.user_a = least(a, b) and f.user_b = greatest(a, b)
  );
$$;

grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Statystyki gracza (MVP: rozegrane = meldunki, ocena = punktualność 1–5)
create or replace function public.player_social_stats(p_user_id uuid)
returns table (
  events_played bigint,
  avg_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::bigint from public.event_check_ins ci where ci.user_id = p_user_id),
  coalesce(
    (
      select round(avg(case when ci.is_late then 3.0 else 5.0 end), 1)
      from public.event_check_ins ci
      where ci.user_id = p_user_id
    ),
    null
  );
$$;

grant execute on function public.player_social_stats(uuid) to authenticated;

-- Wyślij zaproszenie do znajomych
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

grant execute on function public.send_friend_request(uuid) to authenticated;

-- Akceptuj / odrzuć zaproszenie
create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_pair record;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  select fr.from_user_id, fr.to_user_id
  into v_from, v_to
  from public.friend_requests fr
  where fr.id = p_request_id and fr.status = 'pending';

  if v_from is null then
    return 'not_found';
  end if;
  if v_to <> v_uid then
    return 'not_recipient';
  end if;

  if p_accept then
    update public.friend_requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id;

    select * into v_pair from public.ordered_user_pair(v_from, v_to);
    insert into public.friendships (user_a, user_b)
    values (v_pair.user_a, v_pair.user_b)
    on conflict do nothing;

    return 'accepted';
  end if;

  update public.friend_requests
  set status = 'rejected', responded_at = now()
  where id = p_request_id;

  return 'rejected';
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- Usuń znajomego
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

grant execute on function public.remove_friend(uuid) to authenticated;

-- Obserwuj / przestań obserwować
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

grant execute on function public.follow_user(uuid) to authenticated;

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

grant execute on function public.unfollow_user(uuid) to authenticated;

-- Heartbeat — status online
create or replace function public.touch_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.touch_last_seen() to authenticated;

-- Publiczny profil użytkownika (dla ekranu profilu)
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
    'avg_rating', v_stats.avg_rating,
    'is_friend', v_is_friend,
    'is_following', v_is_following,
    'friend_request_status', v_request_status,
    'is_online', v_online,
    'is_self', v_uid = p_user_id
  );
end;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Lista znajomych
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
  where f.user_a = auth.uid() or f.user_b = auth.uid()
  order by p.nick nulls last
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

grant execute on function public.list_friends(integer) to authenticated;

-- Oczekujące zaproszenia (odebrane)
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
    fr.id as request_id,
    fr.from_user_id,
    p.nick,
    p.avatar_url,
    fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user_id
  where fr.to_user_id = auth.uid() and fr.status = 'pending'
  order by fr.created_at desc;
$$;

grant execute on function public.list_friend_requests_incoming() to authenticated;

-- Lista obserwowanych
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
    fo.following_id as user_id,
    p.nick,
    p.avatar_url,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online,
    fo.created_at as followed_at
  from public.follows fo
  join public.profiles p on p.id = fo.following_id
  where fo.follower_id = auth.uid()
  order by fo.created_at desc
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

grant execute on function public.list_following(integer) to authenticated;

-- Lista obserwujących
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
    fo.follower_id as user_id,
    p.nick,
    p.avatar_url,
    (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes') as is_online,
    fo.created_at as followed_at
  from public.follows fo
  join public.profiles p on p.id = fo.follower_id
  where fo.following_id = auth.uid()
  order by fo.created_at desc
  limit least(greatest(coalesce(p_max_rows, 100), 1), 200);
$$;

grant execute on function public.list_followers(integer) to authenticated;

-- Szukaj użytkowników po nicku (min. 2 znaki)
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
  order by p.nick
  limit least(greatest(coalesce(p_max_rows, 20), 1), 50);
$$;

grant execute on function public.search_profiles(text, integer) to authenticated;

notify pgrst, 'reload schema';
