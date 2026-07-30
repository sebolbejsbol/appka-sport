-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Unikalny nick + ochrona admina
-- Kategoria: Profile  |  Typ: BASE  |  Wymaga: 0001
-- Plik: supabase/migrations/0020_profiles_nick_unique_admin_guard.sql
-- SQL Editor: 0020 — unikalny nick + admin
-- ═══════════════════════════════════════════════════════════════════════════
-- Uruchamiaj w kolejności numerów. Skrypt idempotentny (bezpieczny ponownie).

with ranked as (
  select
    id,
    nick,
    row_number() over (
      partition by lower(trim(nick))
      order by created_at asc, id asc
    ) as rn
  from public.profiles
  where nick is not null and trim(nick) <> ''
)
update public.profiles p
set nick = p.nick || '_' || left(replace(p.id::text, '-', ''), 4)
from ranked r
where p.id = r.id
  and r.rn > 1;

-- 2) Unikalność nicku (bez rozróżniania wielkości liter)
drop index if exists public.profiles_nick_unique_idx;
create unique index profiles_nick_unique_idx
  on public.profiles (lower(trim(nick)))
  where nick is not null and trim(nick) <> '';

-- 3) Nikt z API nie może nadać sobie is_admin
create or replace function public.profiles_protect_admin()
returns trigger
language plpgsql
as $$
begin
  -- Bezpośrednia sesja w SQL Editor (postgres) — do ręcznej moderacji
  if current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_admin := false;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_admin on public.profiles;
create trigger profiles_protect_admin
  before insert or update on public.profiles
  for each row execute function public.profiles_protect_admin();

-- 4) Sprawdzenie dostępności nicku (rejestracja bez sesji = anon)
create or replace function public.is_nick_available(p_nick text, p_exclude_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when nullif(trim(p_nick), '') is null then false
    when lower(trim(p_nick)) in ('admin', 'administrator', 'root', 'moderator') then false
    else not exists (
      select 1
      from public.profiles p
      where p.nick is not null
        and trim(p.nick) <> ''
        and lower(trim(p.nick)) = lower(trim(p_nick))
        and (p_exclude_user_id is null or p.id <> p_exclude_user_id)
    )
  end;
$$;

revoke all on function public.is_nick_available(text, uuid) from public;
grant execute on function public.is_nick_available(text, uuid) to anon, authenticated;

-- 5) Aktualizacja profilu przez RPC (walidacja nicku + bez is_admin)
create or replace function public.update_own_profile(
  p_nick text,
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
  v_nick text := nullif(trim(p_nick), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_nick is null or char_length(v_nick) < 2 or char_length(v_nick) > 24 then
    raise exception 'invalid_nick';
  end if;

  if not public.is_nick_available(v_nick, v_uid) then
    raise exception 'nick_taken';
  end if;

  if p_gender is not null and p_gender not in ('male', 'female', 'other') then
    raise exception 'invalid_gender';
  end if;

  update public.profiles
  set
    nick = v_nick,
    show_birth_year = coalesce(p_show_birth_year, true),
    gender = p_gender
  where id = v_uid;
end;
$$;

revoke all on function public.update_own_profile(text, boolean, text) from public;
grant execute on function public.update_own_profile(text, boolean, text) to authenticated;

-- 6) Trigger przy rejestracji — normalizuj nick
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nick text := nullif(trim(new.raw_user_meta_data ->> 'nick'), '');
begin
  if v_nick is not null and not public.is_nick_available(v_nick, null) then
    raise exception 'nick_taken';
  end if;

  insert into public.profiles (id, nick, birth_year)
  values (
    new.id,
    v_nick,
    (new.raw_user_meta_data ->> 'birth_year')::int
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
