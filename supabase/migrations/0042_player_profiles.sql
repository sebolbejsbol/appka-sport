-- ═══════════════════════════════════════════════════════════════════════════
-- 0042 — Rozbudowane profile sportowców
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists country_code text,
  add column if not exists city text,
  add column if not exists favorite_sport text,
  add column if not exists skill_level text;

do $$
begin
  alter table public.profiles
    add constraint profiles_country_code_format check (
      country_code is null or country_code ~ '^[A-Z]{2}$'
    );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.profiles
    add constraint profiles_city_length check (
      city is null or char_length(trim(city)) between 1 and 80
    );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.profiles
    add constraint profiles_favorite_sport_allowed check (
      favorite_sport is null
      or favorite_sport in ('basketball', 'football', 'volleyball', 'handball')
    );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.profiles
    add constraint profiles_skill_level_allowed check (
      skill_level is null
      or skill_level in ('beginner', 'intermediate', 'advanced')
    );
exception
  when duplicate_object then null;
end;
$$;

-- ─── Statystyki profilu ─────────────────────────────────────────────────────

create or replace function public.player_profile_stats(p_user_id uuid)
returns table (
  events_played bigint,
  events_created bigint,
  attendance_rate integer,
  avg_rating numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with played as (
    select count(*)::bigint as cnt
    from public.event_check_ins ci
    where ci.user_id = p_user_id
  ),
  created as (
    select count(*)::bigint as cnt
    from public.events e
    where e.creator_id = p_user_id
  ),
  signups as (
    select count(*)::bigint as cnt
    from public.event_participants ep
    where ep.user_id = p_user_id
  ),
  rating as (
    select round(avg(case when ci.is_late then 3.0 else 5.0 end), 1) as avg_val
    from public.event_check_ins ci
    where ci.user_id = p_user_id
  )
  select
    played.cnt,
    created.cnt,
    case
      when signups.cnt = 0 then 0
      else least(100, round(100.0 * played.cnt / signups.cnt)::integer)
    end,
    rating.avg_val
  from played, created, signups, rating;
$$;

grant execute on function public.player_profile_stats(uuid) to authenticated;

-- Zachowaj kompatybilność wsteczną
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
  select s.events_played, s.avg_rating
  from public.player_profile_stats(p_user_id) s;
$$;

-- ─── Osiągnięcia (obliczane dynamicznie) ────────────────────────────────────

create or replace function public.player_profile_achievements(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_played bigint;
  v_created bigint;
  v_top_creator uuid;
  v_top_active uuid;
  v_result jsonb := '[]'::jsonb;
begin
  select s.events_played, s.events_created
  into v_played, v_created
  from public.player_profile_stats(p_user_id) s;

  if coalesce(v_played, 0) >= 1 then
    v_result := v_result || jsonb_build_array('first_match');
  end if;
  if coalesce(v_played, 0) >= 10 then
    v_result := v_result || jsonb_build_array('ten_events');
  end if;
  if coalesce(v_played, 0) >= 100 then
    v_result := v_result || jsonb_build_array('hundred_events');
  end if;
  if coalesce(v_created, 0) >= 5 then
    v_result := v_result || jsonb_build_array('event_organizer');
  end if;

  select e.creator_id into v_top_creator
  from public.events e
  where date_trunc('month', e.created_at) = date_trunc('month', now())
  group by e.creator_id
  order by count(*) desc, e.creator_id
  limit 1;

  if v_top_creator = p_user_id then
    v_result := v_result || jsonb_build_array('organizer_of_month');
  end if;

  select ci.user_id into v_top_active
  from public.event_check_ins ci
  where ci.checked_in_at > now() - interval '30 days'
  group by ci.user_id
  order by count(*) desc, ci.user_id
  limit 1;

  if v_top_active = p_user_id then
    v_result := v_result || jsonb_build_array('most_active_player');
  end if;

  return v_result::json;
end;
$$;

grant execute on function public.player_profile_achievements(uuid) to authenticated;

-- ─── Edycja własnego profilu ────────────────────────────────────────────────

drop function if exists public.update_own_profile(boolean, text);

create or replace function public.update_own_profile(
  p_show_birth_year boolean,
  p_gender text default null,
  p_country_code text default null,
  p_city text default null,
  p_favorite_sport text default null,
  p_skill_level text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_country text;
  v_city text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    raise exception 'invalid_gender';
  end if;

  v_country := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;

  v_city := nullif(trim(coalesce(p_city, '')), '');
  if v_city is not null and char_length(v_city) > 80 then
    raise exception 'invalid_city';
  end if;

  if p_favorite_sport is not null
    and p_favorite_sport not in ('basketball', 'football', 'volleyball', 'handball') then
    raise exception 'invalid_sport';
  end if;

  if p_skill_level is not null
    and p_skill_level not in ('beginner', 'intermediate', 'advanced') then
    raise exception 'invalid_skill_level';
  end if;

  update public.profiles
  set
    show_birth_year = coalesce(p_show_birth_year, true),
    gender = p_gender,
    country_code = v_country,
    city = v_city,
    favorite_sport = p_favorite_sport,
    skill_level = p_skill_level
  where id = v_uid;
end;
$$;

grant execute on function public.update_own_profile(boolean, text, text, text, text, text) to authenticated;

-- ─── Profil publiczny ───────────────────────────────────────────────────────

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
  v_achievements json;
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

  select
    p.id,
    p.nick,
    p.avatar_url,
    p.last_seen_at,
    p.country_code,
    p.city,
    p.favorite_sport,
    p.skill_level
  into v_profile
  from public.profiles p
  where p.id = p_user_id;

  if v_profile.id is null then
    return json_build_object('error', 'not_found');
  end if;

  select
    s.events_played,
    s.events_created,
    s.attendance_rate,
    s.avg_rating
  into v_stats
  from public.player_profile_stats(p_user_id) s;

  v_achievements := public.player_profile_achievements(p_user_id);

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
    'country_code', v_profile.country_code,
    'city', v_profile.city,
    'favorite_sport', v_profile.favorite_sport,
    'skill_level', v_profile.skill_level,
    'friend_count', v_friends,
    'follower_count', v_followers,
    'following_count', v_following,
    'events_played', coalesce(v_stats.events_played, 0),
    'events_created', coalesce(v_stats.events_created, 0),
    'attendance_rate', coalesce(v_stats.attendance_rate, 0),
    'events_together', coalesce(v_events_together, 0),
    'avg_rating', v_stats.avg_rating,
    'achievements', coalesce(v_achievements, '[]'::json),
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
