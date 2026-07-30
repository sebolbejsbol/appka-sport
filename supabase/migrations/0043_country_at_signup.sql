-- ═══════════════════════════════════════════════════════════════════════════
-- 0043 — Kraj pochodzenia tylko przy rejestracji (miasto edytowalne)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(trim(new.raw_user_meta_data ->> 'nick'), '');
  v_country text := nullif(upper(trim(new.raw_user_meta_data ->> 'country_code')), '');
begin
  if v_nick is not null and not public.is_nick_available(v_nick, null) then
    raise exception 'nick_taken';
  end if;

  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;

  insert into public.profiles (id, nick, birth_year, country_code)
  values (
    new.id,
    v_nick,
    (new.raw_user_meta_data ->> 'birth_year')::int,
    v_country
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.profiles_protect_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    new.nick := old.nick;
    new.country_code := old.country_code;
    return new;
  end if;

  return new;
end;
$$;

drop function if exists public.update_own_profile(boolean, text, text, text, text, text);

create or replace function public.update_own_profile(
  p_show_birth_year boolean,
  p_gender text default null,
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
  v_city text;
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
    favorite_sport = p_favorite_sport,
    skill_level = p_skill_level
  where id = v_uid;
end;
$$;

grant execute on function public.update_own_profile(boolean, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
