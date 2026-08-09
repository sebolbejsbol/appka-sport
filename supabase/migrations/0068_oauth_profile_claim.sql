-- ═══════════════════════════════════════════════════════════════════════════
-- 0068 — Uzupełnienie profilu po pierwszym logowaniu przez OAuth
-- (Google / Facebook / Apple)
-- ═══════════════════════════════════════════════════════════════════════════
-- Kontekst: handle_new_user() tworzy wiersz w profiles przy KAŻDEJ rejestracji,
-- ale nick/birth_year/country_code bierze z raw_user_meta_data — a dostawcy
-- OAuth nie przekazują tych własnych pól (tylko np. email, imię, avatar), więc
-- konto z OAuth dostaje nick = null. Do tej pory nick/country_code były
-- zablokowane na zawsze po insert (trigger profiles_protect_admin zawsze
-- przywracał starą wartość przy UPDATE) — użytkownik OAuth nie miał więc
-- ŻADNEGO sposobu, aby kiedykolwiek ustawić nick.
--
-- Ta migracja:
-- 1) Rozluźnia trigger: nick/country_code są nadpisywane starą wartością
--    TYLKO gdy stara wartość już nie jest pusta (czyli wciąż można ustawić
--    je RAZ, gdy są null — potem znów są zablokowane na zawsze, bez zmiany
--    dotychczasowej gwarancji "nick się nie zmienia po ustawieniu").
-- 2) Dodaje claim_profile_basics(nick, birth_year, country_code) — RPC do
--    jednorazowego uzupełnienia tych pól przez ekran "Dokończ profil" po
--    pierwszym logowaniu OAuth. Jawnie odrzuca próbę użycia, gdy nick jest
--    już ustawiony (nick_already_set), więc nie da się tym obejść blokady.

create or replace function public.profiles_protect_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then new.is_admin := false; return new; end if;
  if tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    if old.nick is not null then
      new.nick := old.nick;
    end if;
    if old.country_code is not null then
      new.country_code := old.country_code;
    end if;
    return new;
  end if;
  return new;
end;
$$;

create or replace function public.claim_profile_basics(
  p_nick text,
  p_birth_year int default null,
  p_country_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := nullif(trim(p_nick), '');
  v_country text := nullif(upper(trim(coalesce(p_country_code, ''))), '');
  v_existing_nick text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select nick into v_existing_nick from public.profiles where id = v_uid;
  if v_existing_nick is not null then
    raise exception 'nick_already_set';
  end if;

  if v_nick is null or char_length(v_nick) < 2 or char_length(v_nick) > 24 then
    raise exception 'invalid_nick';
  end if;

  if lower(v_nick) in ('admin', 'administrator', 'root', 'moderator') then
    raise exception 'invalid_nick';
  end if;

  if not public.is_nick_available(v_nick, v_uid) then
    raise exception 'nick_taken';
  end if;

  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country';
  end if;

  if p_birth_year is not null
    and (p_birth_year < 1900 or p_birth_year > extract(year from now())::int) then
    raise exception 'invalid_birth_year';
  end if;

  update public.profiles
  set
    nick = v_nick,
    birth_year = coalesce(p_birth_year, birth_year),
    country_code = coalesce(v_country, country_code)
  where id = v_uid;
end;
$$;

revoke all on function public.claim_profile_basics(text, int, text) from public;
grant execute on function public.claim_profile_basics(text, int, text) to authenticated;

notify pgrst, 'reload schema';
