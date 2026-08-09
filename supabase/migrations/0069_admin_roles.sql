-- Migracja 0069: role administracyjne (USER / ADMIN / SUPER_ADMIN) + audit log
-- Uruchom w Supabase: Dashboard → SQL Editor → New query → wklej całość → Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

-- 1) Kolumna roli na profilu (is_admin zostaje, synchronizowana automatycznie
--    przez każdą funkcję, która zmienia rolę)
alter table public.profiles
  add column if not exists role text not null default 'user';

do $$
begin
  alter table public.profiles
    add constraint profiles_role_allowed
    check (role in ('user', 'admin', 'super_admin'));
exception
  when duplicate_object then null;
end;
$$;

comment on column public.profiles.role is
  'Rola aplikacji: user | admin | super_admin. is_admin jest z nią zsynchronizowane.';

-- Backfill: istniejący is_admin = true -> role = 'admin' (nie może być
-- is_admin=true przy role='user', to złamałoby założenie synchronizacji).
update public.profiles set role = 'admin' where is_admin and role = 'user';

-- 2) Rozszerz istniejącą ochronę profilu (migracje 0020/0021/0043/0068).
--    Punkt wyjścia to AKTUALNA wersja funkcji z 0068 — dokładamy tylko role.
--    Po zmianie funkcja blokuje z API:
--    - is_admin oraz role: zawsze (INSERT wymusza wartości domyślne,
--      UPDATE przywraca stare),
--    - nick oraz country_code: dopiero gdy są już ustawione (null można
--      uzupełnić raz, np. konta OAuth przez claim_profile_basics).
create or replace function public.profiles_protect_admin()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.role := 'user';
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    new.role := old.role;
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
-- Trigger `profiles_protect_admin` już istnieje (migracja 0020) i jest
-- podpięty pod tę funkcję — `create or replace function` wystarczy.

-- 3) Czy zalogowany użytkownik jest super adminem
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'super_admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- 4) Log audytowy działań administracyjnych — ogólny, wielokrotnego użytku
--    (kolejne fazy turniejowe będą tu dopisywać kolejne akcje).
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Log działań administracyjnych (role, później: turnieje, drużyny, mecze).';

create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;
-- Celowo brak jakichkolwiek polityk: RLS bez polityk = zero bezpośredniego
-- dostępu z klienta (select/insert/update/delete). Cały dostęp idzie przez
-- funkcje security definer poniżej.

-- 5) Lista użytkowników (wyszukiwanie + filtr roli) — tylko super admin
create or replace function public.admin_list_users(
  p_search text default null,
  p_role_filter text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  nick text,
  email text,
  avatar_url text,
  role text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(p_search), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_super_admin() then
    raise exception 'not_super_admin';
  end if;

  return query
  select
    p.id,
    p.nick,
    u.email::text,
    p.avatar_url,
    p.role,
    p.created_at,
    count(*) over() as total_count
  from public.profiles p
  join auth.users u on u.id = p.id
  where
    (p_role_filter is null or p.role = p_role_filter)
    and (
      v_search is null
      or p.nick ilike '%' || v_search || '%'
      or u.email ilike '%' || v_search || '%'
    )
  order by p.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;

-- 6) Nadawanie / odbieranie roli ADMIN — tylko super admin, nigdy super_admin.
--    Struktura tej funkcji jest tym, co gwarantuje bezpieczeństwo (spec §16):
--    - `p_role not in ('user','admin')` -> nikt, nigdy nie nadaje super_admin stąd,
--    - `v_old_role = 'super_admin'` -> super adminów nie da się tu ruszyć w ogóle,
--      co jednocześnie strukturalnie chroni przed usunięciem ostatniego super admina.
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_role text;
begin
  if v_actor is null then
    return 'not_authenticated';
  end if;

  if not public.is_super_admin() then
    return 'not_super_admin';
  end if;

  if p_role not in ('user', 'admin') then
    return 'invalid_role';
  end if;

  select role into v_old_role from public.profiles where id = p_user_id;

  if not found then
    return 'not_found';
  end if;

  if v_old_role = 'super_admin' then
    return 'target_is_super_admin';
  end if;

  if v_old_role = p_role then
    return 'no_change';
  end if;

  update public.profiles
  set role = p_role, is_admin = (p_role = 'admin')
  where id = p_user_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    case when p_role = 'admin' then 'grant_admin' else 'revoke_admin' end,
    'user',
    p_user_id,
    jsonb_build_object('previous_role', v_old_role, 'new_role', p_role)
  );

  return 'ok';
end;
$$;

revoke all on function public.admin_set_user_role(uuid, text) from public;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- 7) Podgląd logu audytowego — tylko super admin
create or replace function public.admin_list_audit_log(
  p_entity_type text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  actor_id uuid,
  actor_nick text,
  action text,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not_super_admin';
  end if;

  return query
  select
    l.id,
    l.actor_id,
    p.nick as actor_nick,
    l.action,
    l.entity_type,
    l.entity_id,
    l.metadata,
    l.created_at
  from public.admin_audit_log l
  left join public.profiles p on p.id = l.actor_id
  where p_entity_type is null or l.entity_type = p_entity_type
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

grant execute on function public.admin_list_audit_log(text, integer) to authenticated;

notify pgrst, 'reload schema';
