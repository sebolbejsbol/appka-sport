-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Nick zablokowany po rejestracji
-- Kategoria: Profile  |  Typ: BASE  |  Wymaga: 0020
-- Plik: supabase/migrations/0021_profile_nick_locked.sql
-- SQL Editor: 0021 — nick zablokowany
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

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
    return new;
  end if;

  return new;
end;
$$;

-- 2) Profil: edycja tylko płci i widoczności roku urodzenia (bez nicku)
drop function if exists public.update_own_profile(text, boolean, text);

create or replace function public.update_own_profile(
  p_show_birth_year boolean,
  p_gender text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    raise exception 'invalid_gender';
  end if;

  update public.profiles
  set
    show_birth_year = coalesce(p_show_birth_year, true),
    gender = p_gender
  where id = v_uid;
end;
$$;

revoke all on function public.update_own_profile(boolean, text) from public;
grant execute on function public.update_own_profile(boolean, text) to authenticated;

notify pgrst, 'reload schema';
