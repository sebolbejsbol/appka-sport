-- ═══════════════════════════════════════════════════════════════════════════
-- 0065 — Bio w profilu, elastyczne dyscypliny zespołów, odporna rejestracja
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Bio w profilu ───────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists bio text;

do $$
begin
  alter table public.profiles
    add constraint profiles_bio_length check (
      bio is null or char_length(trim(bio)) <= 300
    );
exception
  when duplicate_object then null;
end;
$$;

-- ─── 2. Edycja profilu: dodaj bio (usuwamy ulubiony sport/poziom z UI, ale
--      zostawiamy parametry opcjonalne dla zgodności wstecznej) ──────────────
drop function if exists public.update_own_profile(boolean, text, text, text, text);
drop function if exists public.update_own_profile(boolean, text, text, text, text, text);

create or replace function public.update_own_profile(
  p_show_birth_year boolean,
  p_gender text default null,
  p_city text default null,
  p_bio text default null,
  p_sports text[] default null,
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
  v_city text;
  v_bio text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    raise exception 'invalid_gender';
  end if;

  v_city := nullif(trim(coalesce(p_city, '')), '');
  if v_city is not null and char_length(v_city) > 80 then
    raise exception 'invalid_city';
  end if;

  v_bio := nullif(trim(coalesce(p_bio, '')), '');
  if v_bio is not null and char_length(v_bio) > 300 then
    raise exception 'invalid_bio';
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
    city = v_city,
    bio = v_bio,
    sports = coalesce(p_sports, sports),
    favorite_sport = p_favorite_sport,
    skill_level = p_skill_level
  where id = v_uid;
end;
$$;

grant execute on function public.update_own_profile(boolean, text, text, text, text[], text, text) to authenticated;

-- ─── 3. Profil publiczny zwraca bio ─────────────────────────────────────────
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
    p.bio,
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
    'bio', v_profile.bio,
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

-- ─── 4. Rejestracja odporna na błędy triggera ───────────────────────────────
-- Wcześniej każdy wyjątek w handle_new_user kończył się „Database error saving
-- new user" i blokował rejestrację (np. z innego telefonu). Profil i tak jest
-- tworzony leniwie przez getOrCreateProfile po pierwszym zalogowaniu, więc tutaj
-- łapiemy wszystkie błędy i nie blokujemy powstania konta.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(trim(new.raw_user_meta_data ->> 'nick'), '');
  v_country text := nullif(upper(trim(new.raw_user_meta_data ->> 'country_code')), '');
  v_language text := lower(trim(coalesce(new.raw_user_meta_data ->> 'language', '')));
  v_birth_year int;
begin
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  if v_language is null or v_language not in ('pl', 'en') then
    v_language := 'pl';
  end if;

  begin
    v_birth_year := (new.raw_user_meta_data ->> 'birth_year')::int;
  exception
    when others then
      v_birth_year := null;
  end;

  begin
    insert into public.profiles (id, nick, birth_year, country_code, language)
    values (new.id, v_nick, v_birth_year, v_country, v_language)
    on conflict (id) do nothing;
  exception
    when others then
      -- Nie blokujemy rejestracji — profil powstanie leniwie przy logowaniu.
      null;
  end;

  return new;
end;
$$;

-- ─── 5. Zespoły: dowolna dyscyplina/typ zespołu (na bazie naszych wydarzeń
--      lub własny pomysł „Inne") ────────────────────────────────────────────
alter table public.teams drop constraint if exists teams_sport_allowed;

do $$
begin
  alter table public.teams
    add constraint teams_sport_length check (
      sport is null or char_length(trim(sport)) between 1 and 80
    );
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_sport text default 'inne',
  p_logo_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_sport text := nullif(trim(coalesce(p_sport, '')), '');
  v_team_id uuid;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;
  if v_sport is null then
    v_sport := 'inne';
  end if;
  if char_length(v_sport) > 80 then
    raise exception 'invalid_sport';
  end if;

  insert into public.teams (name, description, sport, logo_url, owner_id)
  values (
    v_name,
    nullif(trim(coalesce(p_description, '')), ''),
    v_sport,
    nullif(trim(coalesce(p_logo_url, '')), ''),
    v_uid
  )
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, v_uid, 'owner');

  insert into public.conversations (kind) values ('team') returning id into v_conv;

  insert into public.team_conversations (team_id, conversation_id)
  values (v_team_id, v_conv);

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_uid);

  return v_team_id;
end;
$$;

grant execute on function public.create_team(text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
