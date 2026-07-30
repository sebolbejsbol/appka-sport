-- ═══════════════════════════════════════════════════════════════════════════
-- 0059 — Zapis preferowanego języka wybranego przy rejestracji
-- Bez tego handle_new_user nie zapisywał profiles.language, więc po pierwszym
-- logowaniu useProfileLanguage nadpisywał wybór użytkownika domyślnym 'pl'.
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
  v_language text := lower(trim(coalesce(new.raw_user_meta_data ->> 'language', '')));
begin
  if v_nick is not null and not public.is_nick_available(v_nick, null) then
    raise exception 'nick_taken';
  end if;

  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;

  if v_language is null or v_language not in ('pl', 'en') then
    v_language := 'pl';
  end if;

  insert into public.profiles (id, nick, birth_year, country_code, language)
  values (
    new.id,
    v_nick,
    (new.raw_user_meta_data ->> 'birth_year')::int,
    v_country,
    v_language
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
