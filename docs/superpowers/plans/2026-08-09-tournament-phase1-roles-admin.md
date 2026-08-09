# Phase 1: Roles & Admin Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a real `USER` / `ADMIN` / `SUPER_ADMIN` role system, enforced entirely in Postgres, plus a Super-Admin-only `/admin/users` screen to grant and remove `ADMIN` access — the security foundation the later tournament phases build on.

**Architecture:** Add `profiles.role` alongside the existing `profiles.is_admin` boolean (kept in sync automatically so all 15 existing files depending on `is_app_admin()` keep working untouched). All role mutations go through a new `SECURITY DEFINER` RPC (`admin_set_user_role`) gated by a new `is_super_admin()` helper, following the exact pattern already used by `admin_user_reports_queue` / `admin_update_user_report`. A generic `admin_audit_log` table records every grant/revoke, reusable by later phases. Frontend follows the existing `admin/reports.tsx` screen shape (custom header, `FlatList`, filter chips, `Alert.alert` confirmations, string-status-code RPC results).

**Tech Stack:** Expo Router (React Native + react-native-web), Supabase (Postgres + RLS), TypeScript, i18n via `t()` (`src/i18n/{en,pl}.ts`). No JS test runner exists in this repo — SQL-level behavior is verified with `do $$ ... $$` assertion scripts under `supabase/tests/` (see `supabase/tests/messaging_v2_test.sql` for the established convention), run manually against a dev/staging Supabase project via the SQL editor. TypeScript changes are verified with `npx tsc --noEmit`.

## Global Constraints

- Expo SDK 56 — check https://docs.expo.dev/versions/v56.0.0/ before using any Expo API not already used elsewhere in this codebase.
- Migrations are plain numbered `.sql` files in `supabase/migrations/`, applied manually via Supabase Dashboard → SQL Editor → Run (there is no CLI/push script in this repo). Every migration must be idempotent (safe to re-run), matching all existing migrations' header comments.
- Never touch `profiles.is_admin`, `profiles.nick`, or now `profiles.role` from anywhere except a `SECURITY DEFINER` function — the `profiles_protect_admin` trigger enforces this and must keep doing so for all three columns.
- All new RPCs follow the existing status-code-return convention (`'ok' | 'not_admin' | ...`), not thrown exceptions, for functions the client calls directly to perform an action (see `admin_update_user_report`). Functions that only *read* and are always called by an already-authorized caller may `raise exception` on authorization failure (see `admin_user_reports_queue`).
- All new/changed `.sql` functions: `revoke all ... from public; grant execute ... to authenticated;` (or grant directly to authenticated with no explicit revoke, matching whichever nearby function you're copying), and the migration ends with `notify pgrst, 'reload schema';`.
- Money quote from the design spec (`docs/superpowers/specs/2026-08-09-tournament-phase1-roles-admin-design.md`) — read it in full before starting; this plan implements it exactly.

---

## Task 1: Migration 0069 — role column, audit log, and role-management RPCs

**Files:**
- Create: `supabase/migrations/0069_admin_roles.sql`

**Interfaces:**
- Produces (consumed by later tasks and later phases):
  - `public.is_super_admin() returns boolean`
  - `public.admin_list_users(p_search text, p_role_filter text, p_limit integer, p_offset integer) returns table(id uuid, nick text, email text, avatar_url text, role text, created_at timestamptz, total_count bigint)`
  - `public.admin_set_user_role(p_user_id uuid, p_role text) returns text` — return values: `'ok' | 'not_authenticated' | 'not_super_admin' | 'invalid_role' | 'not_found' | 'target_is_super_admin' | 'no_change'`
  - `public.admin_list_audit_log(p_entity_type text, p_limit integer) returns table(id uuid, actor_id uuid, actor_nick text, action text, entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz)`
  - Table `public.admin_audit_log(id, actor_id, action, entity_type, entity_id, metadata, created_at)`
  - Column `public.profiles.role text` (`'user' | 'admin' | 'super_admin'`, default `'user'`), kept in sync with the existing `is_admin` boolean by every writer.

- [ ] **Step 1: Write the migration file**

```sql
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

-- 2) Rozszerz istniejącą ochronę profilu (migracje 0020/0021/0043/0068):
--    is_admin, nick, a teraz też role — zablokowane z API.
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
    new.role := 'user';
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.is_admin := old.is_admin;
    new.role := old.role;
    new.nick := old.nick;
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
  actor_id uuid not null references auth.users (id) on delete cascade,
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
```

- [ ] **Step 2: Apply the migration**

Open the Supabase Dashboard for this project → SQL Editor → New query → paste the
entire contents of `supabase/migrations/0069_admin_roles.sql` → Run. Confirm it
completes with no errors. This must be done by whoever has dashboard access (the
harness executing this plan cannot reach the live database) — flag this step to the
user if you are an agent without Supabase dashboard credentials.

- [ ] **Step 3: Sanity-check in the SQL editor**

Run: `select column_name from information_schema.columns where table_name = 'profiles' and column_name in ('role', 'is_admin');`
Expected: both rows present.

Run: `select proname from pg_proc where proname in ('is_super_admin', 'admin_list_users', 'admin_set_user_role', 'admin_list_audit_log');`
Expected: all four rows present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0069_admin_roles.sql
git commit -m "Add role column, audit log, and admin role RPCs"
```

---

## Task 2: Migration 0070 — seed the first Super Admin

**Files:**
- Create: `supabase/migrations/0070_seed_first_super_admin.sql`

**Interfaces:**
- Consumes: `public.profiles.role`, `public.profiles.is_admin` from Task 1.
- Produces: one row in `public.profiles` with `role = 'super_admin'` for
  `tymanskifilip@gmail.com`, which every later task's manual testing depends on.

- [ ] **Step 1: Write the migration file**

```sql
-- Migracja 0070: nadanie pierwszej roli super_admin
-- Uruchom RAZ, jako postgres, w Supabase SQL Editor — wykonywana z panelu
-- dashboardu current_user = 'postgres', więc trigger profiles_protect_admin
-- (migracja 0069) przepuszcza tę zmianę.
-- Wymaga, żeby konto tymanskifilip@gmail.com już istniało (zarejestrowane w appce).

do $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = 'tymanskifilip@gmail.com';

  if v_id is null then
    raise exception
      'Nie znaleziono konta tymanskifilip@gmail.com — załóż konto w aplikacji, potem uruchom tę migrację ponownie.';
  end if;

  update public.profiles
  set role = 'super_admin', is_admin = true
  where id = v_id;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Same manual process as Task 1 Step 2. If it raises the "account not found"
exception, the account must sign up in the app first, then this migration re-run.

- [ ] **Step 3: Sanity-check**

Run: `select id, nick, role, is_admin from public.profiles p join auth.users u on u.id = p.id where u.email = 'tymanskifilip@gmail.com';`
Expected: one row, `role = 'super_admin'`, `is_admin = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0070_seed_first_super_admin.sql
git commit -m "Seed first Super Admin account"
```

---

## Task 3: SQL behavior test for the role RPCs

**Files:**
- Create: `supabase/tests/admin_roles_test.sql`

**Interfaces:**
- Consumes: everything produced by Task 1 (`is_super_admin`, `admin_list_users`,
  `admin_set_user_role`, `admin_list_audit_log`, `admin_audit_log` table). Requires
  Task 2 to have run first (needs an existing `super_admin` row) and at least 3
  total profiles to exist in the target database (create two throwaway test
  accounts first if the project has fewer than 3 users).

- [ ] **Step 1: Write the test script**

```sql
-- ============================================================================
-- Role administracyjne — testy funkcjonalne backendu (asercje PL/pgSQL).
-- Uruchamiaj na środowisku testowym/stagingu, jako postgres w SQL Editor.
-- Wymaga: co najmniej 1 profil super_admin (migracja 0070) i 3 profile łącznie.
-- Pełne przejście = brak wyjątku; tabela _t na końcu zawiera zaliczone kroki.
-- ============================================================================

create temp table _t(step text) on commit drop;
do $$
declare
  v_super uuid; v_admin uuid; v_user uuid;
  v_result text;
  v_role text;
  v_is_admin boolean;
  v_count integer;
begin
  select id into v_super from public.profiles where role = 'super_admin' order by created_at limit 1;
  if v_super is null then
    raise exception 'Potrzebny co najmniej 1 profil super_admin — uruchom migrację 0070 najpierw';
  end if;

  select id into v_admin from public.profiles where id <> v_super order by created_at limit 1;
  select id into v_user from public.profiles where id <> v_super and id <> v_admin order by created_at limit 1;
  if v_admin is null or v_user is null then
    raise exception 'Potrzebne min. 3 profile do testu (znaleziono za mało)';
  end if;

  -- reset stanu testowego, na wypadek ponownego uruchomienia
  update public.profiles set role = 'user', is_admin = false where id in (v_admin, v_user);
  delete from public.admin_audit_log where entity_id in (v_admin, v_user);

  -- 1) Zwykły user nie może nadać sobie roli
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'admin') into v_result;
  if v_result <> 'not_super_admin' then raise exception 'FAIL self-grant blocked, got %', v_result; end if;
  insert into _t values ('self-grant blocked OK');

  -- 2) Super admin nadaje ADMIN
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_admin, 'admin') into v_result;
  if v_result <> 'ok' then raise exception 'FAIL grant admin, got %', v_result; end if;
  select role, is_admin into v_role, v_is_admin from public.profiles where id = v_admin;
  if v_role <> 'admin' then raise exception 'FAIL role not persisted, got %', v_role; end if;
  if not v_is_admin then raise exception 'FAIL is_admin not synced on grant'; end if;
  insert into _t values ('grant admin + is_admin sync OK');

  -- 3) Log audytowy zapisany
  select count(*) into v_count from public.admin_audit_log
    where entity_id = v_admin and action = 'grant_admin' and actor_id = v_super;
  if v_count <> 1 then raise exception 'FAIL audit log missing for grant, count=%', v_count; end if;
  insert into _t values ('audit log grant OK');

  -- 4) admin_list_users pokazuje nowego admina pod filtrem 'admin'
  select count(*) into v_count from public.admin_list_users(null, 'admin', 100, 0) r where r.id = v_admin;
  if v_count <> 1 then raise exception 'FAIL admin_list_users did not return new admin'; end if;
  insert into _t values ('admin_list_users filter OK');

  -- 5) admin_list_audit_log pokazuje wpis
  select count(*) into v_count from public.admin_list_audit_log('user', 200) r
    where r.entity_id = v_admin and r.action = 'grant_admin';
  if v_count <> 1 then raise exception 'FAIL admin_list_audit_log missing entry'; end if;
  insert into _t values ('admin_list_audit_log OK');

  -- 6) Nowo mianowany ADMIN nie może nadawać ról (nie jest super adminem)
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'admin') into v_result;
  if v_result <> 'not_super_admin' then raise exception 'FAIL admin cannot grant, got %', v_result; end if;
  insert into _t values ('admin cannot grant OK');

  -- 7) Nie można nadać roli super_admin przez RPC
  perform set_config('request.jwt.claims', json_build_object('sub', v_super, 'role', 'authenticated')::text, true);
  select public.admin_set_user_role(v_user, 'super_admin') into v_result;
  if v_result <> 'invalid_role' then raise exception 'FAIL super_admin grant blocked, got %', v_result; end if;
  insert into _t values ('super_admin grant blocked OK');

  -- 8) Nie można dotknąć istniejącego super admina (chroni przed usunięciem ostatniego)
  select public.admin_set_user_role(v_super, 'user') into v_result;
  if v_result <> 'target_is_super_admin' then raise exception 'FAIL super_admin protected, got %', v_result; end if;
  insert into _t values ('super_admin protected OK');

  -- 9) Super admin odbiera ADMIN
  select public.admin_set_user_role(v_admin, 'user') into v_result;
  if v_result <> 'ok' then raise exception 'FAIL revoke admin, got %', v_result; end if;
  select role, is_admin into v_role, v_is_admin from public.profiles where id = v_admin;
  if v_role <> 'user' then raise exception 'FAIL role not reverted, got %', v_role; end if;
  if v_is_admin then raise exception 'FAIL is_admin not reverted on revoke'; end if;
  insert into _t values ('revoke admin + is_admin sync OK');

  raise notice 'Wszystkie testy ról administracyjnych zaliczone: %', (select string_agg(step, ', ') from _t);
end;
$$;

select * from _t;
```

- [ ] **Step 2: Run it and verify**

Paste into the SQL editor of a dev/staging Supabase project (never production
directly) and run. Expected: the final `select * from _t` returns 9 rows, one per
`insert into _t values (...)` line above, and no exception was raised. If any step
raises, the exception message names exactly which check failed.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/admin_roles_test.sql
git commit -m "Add SQL behavior test for admin role RPCs"
```

---

## Task 4: `profiles.ts` — expose `role`

**Files:**
- Modify: `src/lib/profiles.ts:7-25` (the `Profile` type and `PROFILE_COLUMNS` constant), and append a new function near `getProfileAdminFlag` (currently `src/lib/profiles.ts:212-223`).

**Interfaces:**
- Consumes: `role` column from Task 1.
- Produces: `export type AppRole = 'user' | 'admin' | 'super_admin';`,
  `export async function getProfileRole(userId: string): Promise<{ role: AppRole; error: { message: string } | null }>`
  — used by Task 5's hook.

- [ ] **Step 1: Add the `AppRole` type and extend `Profile`**

In `src/lib/profiles.ts`, above the `Profile` type (currently line 7), add:

```ts
export type AppRole = 'user' | 'admin' | 'super_admin';
```

Then add `role: AppRole;` as a new field inside the `Profile` type, right after
the existing `is_admin: boolean;` line.

- [ ] **Step 2: Include `role` in the select columns**

Find the `PROFILE_COLUMNS` constant (currently line 24-25):

```ts
const PROFILE_COLUMNS =
  'id, nick, birth_year, show_birth_year, gender, avatar_url, country_code, city, bio, favorite_sport, skill_level, sports, language, is_admin';
```

Change it to append `, role`:

```ts
const PROFILE_COLUMNS =
  'id, nick, birth_year, show_birth_year, gender, avatar_url, country_code, city, bio, favorite_sport, skill_level, sports, language, is_admin, role';
```

- [ ] **Step 3: Add `getProfileRole`**

Right after the existing `getProfileAdminFlag` function (ends at line 223), add:

```ts
export async function getProfileRole(
  userId: string,
): Promise<{ role: AppRole; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: AppRole }>();

  if (error) return { role: 'user', error };
  return { role: data?.role ?? 'user', error: null };
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/profiles.ts` (there are no other
construction sites of the `Profile` type in this codebase — it's only ever
populated from Supabase query results via `.maybeSingle<Profile>()` /
`.single<Profile>()`, so widening it with a new required field is safe).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles.ts
git commit -m "Expose profiles.role via AppRole and getProfileRole"
```

---

## Task 5: `useUserRole` hook

**Files:**
- Create: `src/hooks/use-user-role.ts`

**Interfaces:**
- Consumes: `useSession()` from `src/context/session.tsx` (`session.user.id`),
  `getProfileRole` and `AppRole` from Task 4.
- Produces:
  `export function useUserRole(): { role: AppRole | null; isAdmin: boolean; isSuperAdmin: boolean; loading: boolean }`
  — consumed by Task 8 (`admin/users.tsx`) and Task 9 (`admin/index.tsx`).

- [ ] **Step 1: Write the hook**

```ts
import { useEffect, useState } from 'react';

import { useSession } from '@/context/session';
import { getProfileRole, type AppRole } from '@/lib/profiles';

export function useUserRole(): {
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
} {
  const { session } = useSession();
  const userId = session?.user?.id;
  const [role, setRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (!userId) {
      setRole('user');
      return;
    }

    let active = true;
    getProfileRole(userId).then(({ role: fetchedRole }) => {
      if (active) setRole(fetchedRole);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  return {
    role,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    loading: role === null && Boolean(userId),
  };
}
```

This mirrors `src/hooks/use-is-admin.ts` exactly (same effect/cleanup shape), just
sourcing `role` instead of `is_admin`. Leave `use-is-admin.ts` untouched — nothing
in this plan removes it.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-user-role.ts
git commit -m "Add useUserRole hook"
```

---

## Task 6: `src/lib/admin-users.ts` — RPC wrappers

**Files:**
- Create: `src/lib/admin-users.ts`

**Interfaces:**
- Consumes: `admin_list_users` and `admin_set_user_role` RPCs from Task 1,
  `AppRole` from Task 4.
- Produces:
  - `export type AdminUserRow = { id: string; nick: string | null; email: string | null; avatar_url: string | null; role: AppRole; created_at: string }`
  - `export type SetUserRoleResult = 'ok' | 'not_authenticated' | 'not_super_admin' | 'invalid_role' | 'not_found' | 'target_is_super_admin' | 'no_change' | 'error'`
  - `export async function getAdminUserList(search: string, roleFilter: AppRole | null, limit?: number, offset?: number): Promise<{ data: AdminUserRow[]; totalCount: number; error: { message: string } | null }>`
  - `export async function setUserRole(userId: string, role: 'user' | 'admin'): Promise<SetUserRoleResult>`
  — both consumed by Task 8 (`admin/users.tsx`).

- [ ] **Step 1: Write the file**

```ts
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/lib/profiles';

export type AdminUserRow = {
  id: string;
  nick: string | null;
  email: string | null;
  avatar_url: string | null;
  role: AppRole;
  created_at: string;
};

export type SetUserRoleResult =
  | 'ok'
  | 'not_authenticated'
  | 'not_super_admin'
  | 'invalid_role'
  | 'not_found'
  | 'target_is_super_admin'
  | 'no_change'
  | 'error';

function mapUserRow(raw: Record<string, unknown>): AdminUserRow {
  const role = raw.role;
  const validRole: AppRole = role === 'admin' || role === 'super_admin' ? role : 'user';

  return {
    id: String(raw.id ?? ''),
    nick: typeof raw.nick === 'string' ? raw.nick : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    role: validRole,
    created_at: String(raw.created_at ?? ''),
  };
}

export async function getAdminUserList(
  search: string,
  roleFilter: AppRole | null,
  limit = 50,
  offset = 0,
): Promise<{ data: AdminUserRow[]; totalCount: number; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search.trim() || null,
    p_role_filter: roleFilter,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { data: [], totalCount: 0, error };

  const rows = (data as Record<string, unknown>[] | null) ?? [];
  const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? 0) : 0;
  return { data: rows.map(mapUserRow), totalCount, error: null };
}

export async function setUserRole(
  userId: string,
  role: 'user' | 'admin',
): Promise<SetUserRoleResult> {
  const { data, error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return 'error';
  return (data as SetUserRoleResult | null) ?? 'error';
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/admin-users.ts
git commit -m "Add admin-users RPC wrappers"
```

---

## Task 7: i18n — `admin.usersTitle`/`usersHint` + `adminUsers` namespace

**Files:**
- Modify: `src/i18n/en.ts:894-902` (the `admin` block) and after `src/i18n/en.ts:1271-1289` (the `adminReports` block, insert a new `adminUsers` block right after it, before `errors:`)
- Modify: `src/i18n/pl.ts:895-903` (the `admin` block) and after `src/i18n/pl.ts:1278-1296` (the `adminReports` block, insert a new `adminUsers` block right after it, before `errors:`)

**Interfaces:**
- Produces: `t('admin.usersTitle')`, `t('admin.usersHint')`, and every
  `t('adminUsers.*')` key listed below — consumed by Task 8 and Task 9. Note this
  codebase's `t()` has no interpolation (`t(key: TKey): string` only, see
  `src/i18n/index.ts:122`), so confirmation copy must be generic, not
  parameterized with a name.

- [ ] **Step 1: `en.ts` — extend the `admin` block**

In `src/i18n/en.ts`, inside the `admin: { ... }` block (currently ending at line
902 with `reportsHint: '...'`), add two keys right after `reportsHint`:

```ts
    usersTitle: 'Administrators',
    usersHint: 'Grant or remove admin access.',
```

- [ ] **Step 2: `en.ts` — add the `adminUsers` namespace**

Right after the `adminReports: { ... }` block closes (currently line 1289, just
before `errors: {`), insert:

```ts
  adminUsers: {
    title: 'Administrators',
    hint: 'Search any user and grant or remove admin access.',
    searchLabel: 'Search',
    searchPlaceholder: 'Search by nickname or email…',
    filterAdmins: 'Admins',
    filterSuperAdmins: 'Super admins',
    filterEveryone: 'Everyone',
    emptyAdmins: 'No admins yet.',
    emptySuperAdmins: 'No super admins found.',
    emptyEveryone: 'No users match your search.',
    loadError: 'Could not load users.',
    notSuperAdmin: 'You do not have Super Admin access.',
    actionError: 'Could not save this change. Try again.',
    roleUser: 'User',
    roleAdmin: 'Admin',
    roleSuperAdmin: 'Super Admin',
    grantAdmin: 'Grant Admin',
    removeAdmin: 'Remove Admin',
    grantConfirmTitle: 'Grant Admin access?',
    grantConfirmMessage: 'This user will be able to create and manage official tournaments.',
    removeConfirmTitle: 'Remove Admin access?',
    removeConfirmMessage: 'This user will lose access to admin tools.',
  },
```

- [ ] **Step 3: `pl.ts` — extend the `admin` block**

In `src/i18n/pl.ts`, inside the `admin: { ... }` block (currently ending at line
903 with `reportsHint: '...'`), add:

```ts
    usersTitle: 'Administratorzy',
    usersHint: 'Nadawaj lub odbieraj dostęp administratora.',
```

- [ ] **Step 4: `pl.ts` — add the `adminUsers` namespace**

Right after the `adminReports: { ... }` block closes (currently line 1296, just
before `errors: {`), insert:

```ts
  adminUsers: {
    title: 'Administratorzy',
    hint: 'Wyszukaj użytkownika i nadaj lub odbierz mu dostęp administratora.',
    searchLabel: 'Szukaj',
    searchPlaceholder: 'Szukaj po nicku lub e-mailu…',
    filterAdmins: 'Administratorzy',
    filterSuperAdmins: 'Super administratorzy',
    filterEveryone: 'Wszyscy',
    emptyAdmins: 'Brak administratorów.',
    emptySuperAdmins: 'Brak super administratorów.',
    emptyEveryone: 'Brak użytkowników pasujących do wyszukiwania.',
    loadError: 'Nie udało się wczytać użytkowników.',
    notSuperAdmin: 'Nie masz dostępu Super Administratora.',
    actionError: 'Nie udało się zapisać zmiany. Spróbuj ponownie.',
    roleUser: 'Użytkownik',
    roleAdmin: 'Administrator',
    roleSuperAdmin: 'Super Administrator',
    grantAdmin: 'Nadaj Admina',
    removeAdmin: 'Odbierz Admina',
    grantConfirmTitle: 'Nadać dostęp administratora?',
    grantConfirmMessage: 'Ten użytkownik będzie mógł tworzyć i zarządzać oficjalnymi turniejami.',
    removeConfirmTitle: 'Odebrać dostęp administratora?',
    removeConfirmMessage: 'Ten użytkownik straci dostęp do narzędzi administracyjnych.',
  },
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The `TKey` type in `src/i18n/index.ts` is derived from
`Translations` = `typeof pl`, so `pl.ts` must be edited for the new keys to be
usable via `t(...)` at all — `en.ts` alone isn't enough for type-checking.)

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/i18n/pl.ts
git commit -m "Add admin.usersTitle/usersHint and adminUsers i18n namespace"
```

---

## Task 8: `/admin/users` screen

**Files:**
- Create: `src/app/(app)/admin/users.tsx`

**Interfaces:**
- Consumes: `useUserRole` (Task 5), `getAdminUserList`/`setUserRole`/`AdminUserRow`
  (Task 6), `AppRole` (Task 4), `t('adminUsers.*')`/`t('common.*')` (Task 7),
  `goBack` from `src/lib/navigation.ts`, `Brand` from `src/constants/theme.ts`,
  `TextField` from `src/components/text-field.tsx`.
- Produces: the route `/admin/users`, linked from Task 9.

- [ ] **Step 1: Write the screen**

```tsx
import { useFocusEffect } from 'expo-router';
import type { Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextField } from '@/components/text-field';
import { Brand } from '@/constants/theme';
import { useUserRole } from '@/hooks/use-user-role';
import { t } from '@/i18n';
import { getAdminUserList, setUserRole, type AdminUserRow } from '@/lib/admin-users';
import { goBack } from '@/lib/navigation';
import type { AppRole } from '@/lib/profiles';

const FILTERS: Exclude<AppRole, 'user'>[] = ['admin', 'super_admin'];
const PAGE_SIZE = 50;

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { isSuperAdmin, loading: roleLoading } = useUserRole();

  const [filter, setFilter] = useState<AppRole | null>('admin');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    setLoadError(false);
    setActionError(null);
    const { data, totalCount: count, error } = await getAdminUserList(
      debouncedSearch,
      filter,
      PAGE_SIZE,
      0,
    );
    setUsers(data);
    setTotalCount(count);
    setLoadError(Boolean(error));
    setLoading(false);
  }, [debouncedSearch, filter, isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  useFocusEffect(
    useCallback(() => {
      if (isSuperAdmin) void load();
    }, [isSuperAdmin, load]),
  );

  function filterLabel(key: AppRole): string {
    if (key === 'admin') return t('adminUsers.filterAdmins');
    if (key === 'super_admin') return t('adminUsers.filterSuperAdmins');
    return t('adminUsers.filterEveryone');
  }

  function emptyLabel(): string {
    if (filter === 'admin') return t('adminUsers.emptyAdmins');
    if (filter === 'super_admin') return t('adminUsers.emptySuperAdmins');
    return t('adminUsers.emptyEveryone');
  }

  function confirmGrant(user: AdminUserRow) {
    Alert.alert(t('adminUsers.grantConfirmTitle'), t('adminUsers.grantConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('adminUsers.grantAdmin'), onPress: () => void handleSetRole(user.id, 'admin') },
    ]);
  }

  function confirmRemove(user: AdminUserRow) {
    Alert.alert(t('adminUsers.removeConfirmTitle'), t('adminUsers.removeConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('adminUsers.removeAdmin'),
        style: 'destructive',
        onPress: () => void handleSetRole(user.id, 'user'),
      },
    ]);
  }

  async function handleSetRole(userId: string, role: 'user' | 'admin') {
    setBusyId(userId);
    setActionError(null);
    const result = await setUserRole(userId, role);
    setBusyId(null);

    if (result === 'ok' || result === 'no_change' || result === 'not_found') {
      void load();
      return;
    }
    if (result === 'not_super_admin') {
      setDenied(true);
      return;
    }
    setActionError(t('adminUsers.actionError'));
  }

  if (roleLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      </View>
    );
  }

  if (!isSuperAdmin || denied) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>‹ {t('common.back')}</Text>
        </Pressable>
        <Text style={styles.title}>{t('adminUsers.title')}</Text>
        <Text style={styles.muted}>{t('adminUsers.notSuperAdmin')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={() => goBack('/admin' as Href)} hitSlop={12} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('common.back')}</Text>
      </Pressable>

      <Text style={styles.title}>{t('adminUsers.title')}</Text>
      <Text style={styles.hint}>{t('adminUsers.hint')}</Text>

      <TextField
        label={t('adminUsers.searchLabel')}
        placeholder={t('adminUsers.searchPlaceholder')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filtersRow}>
        {[...FILTERS, null].map((key) => {
          const active = filter === key;
          return (
            <Pressable
              key={key ?? 'everyone'}
              onPress={() => setFilter(key)}
              style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filterLabel(key ?? 'user')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : loadError ? (
        <Text style={styles.muted}>{t('adminUsers.loadError')}</Text>
      ) : users.length === 0 ? (
        <Text style={styles.muted}>{emptyLabel()}</Text>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <Text style={styles.countLabel}>
              {users.length} / {totalCount}
            </Text>
          }
          renderItem={({ item }) => (
            <UserRow
              user={item}
              busy={busyId === item.id}
              onGrant={() => confirmGrant(item)}
              onRemove={() => confirmRemove(item)}
            />
          )}
        />
      )}
    </View>
  );
}

type RowProps = {
  user: AdminUserRow;
  busy: boolean;
  onGrant: () => void;
  onRemove: () => void;
};

function UserRow({ user, busy, onGrant, onRemove }: RowProps) {
  const nick = user.nick?.trim() || t('common.nick');
  const roleLabel =
    user.role === 'super_admin'
      ? t('adminUsers.roleSuperAdmin')
      : user.role === 'admin'
        ? t('adminUsers.roleAdmin')
        : t('adminUsers.roleUser');

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{nick}</Text>
        {user.email ? <Text style={styles.rowMeta}>{user.email}</Text> : null}
        <Text style={styles.roleBadge}>{roleLabel}</Text>
      </View>

      {user.role === 'super_admin' ? null : (
        <View style={styles.rowActions}>
          {user.role === 'admin' ? (
            <Pressable
              style={({ pressed }) => [styles.removeBtn, pressed && styles.pressed]}
              onPress={onRemove}
              disabled={busy}>
              <Text style={styles.removeBtnText}>{t('adminUsers.removeAdmin')}</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.grantBtn, pressed && styles.pressed]}
              onPress={onGrant}
              disabled={busy}>
              <Text style={styles.grantBtnText}>{t('adminUsers.grantAdmin')}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: Brand.screenBackground,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    color: Brand.textSecondary,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Brand.textPrimary,
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: Brand.textMuted,
    marginBottom: 16,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.surface,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  filterChipActive: {
    backgroundColor: Brand.primary,
    borderColor: Brand.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.textPrimary,
  },
  filterChipTextActive: {
    color: Brand.primaryText,
  },
  loader: {
    marginTop: 32,
  },
  muted: {
    fontSize: 15,
    color: Brand.textMuted,
    marginTop: 24,
  },
  errorText: {
    fontSize: 14,
    color: Brand.danger,
    marginBottom: 8,
  },
  countLabel: {
    fontSize: 13,
    color: Brand.textMuted,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Brand.border,
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowActions: {
    gap: 8,
    paddingTop: 2,
    maxWidth: 140,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Brand.primary,
  },
  rowMeta: {
    fontSize: 13,
    color: Brand.textSecondary,
  },
  roleBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: Brand.textMuted,
    marginTop: 2,
  },
  grantBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Brand.primary,
  },
  grantBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.primaryText,
    textAlign: 'center',
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.danger,
    backgroundColor: Brand.surface,
  },
  removeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Brand.danger,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/admin/users.tsx"
git commit -m "Add /admin/users Super Admin management screen"
```

---

## Task 9: Wire `/admin/users` into the admin hub

**Files:**
- Modify: `src/app/(app)/admin/index.tsx` (entire file — it's short, ~142 lines)

**Interfaces:**
- Consumes: `useUserRole` (Task 5), route `/admin/users` (Task 8).

- [ ] **Step 1: Switch the hook and extend the tool list**

Replace the import:

```ts
import { useIsAdmin } from '@/hooks/use-is-admin';
```

with:

```ts
import { useUserRole } from '@/hooks/use-user-role';
```

Replace the `AdminTool` type's `path` union and `buildAdminTools`:

```ts
type AdminTool = {
  key: string;
  title: string;
  hint: string;
  path: '/admin/fields' | '/admin/reports' | '/admin/users';
};

// Funkcja, nie stała modułowa — inaczej etykiety zamrażałyby się w języku
// z chwili importu modułu i nie zmieniałyby się po przełączeniu języka.
function buildAdminTools(isSuperAdmin: boolean): AdminTool[] {
  const tools: AdminTool[] = [
    {
      key: 'fields',
      title: t('admin.fieldsTitle'),
      hint: t('admin.fieldsHint'),
      path: '/admin/fields',
    },
    {
      key: 'reports',
      title: t('admin.reportsTitle'),
      hint: t('admin.reportsHint'),
      path: '/admin/reports',
    },
  ];

  if (isSuperAdmin) {
    tools.push({
      key: 'users',
      title: t('admin.usersTitle'),
      hint: t('admin.usersHint'),
      path: '/admin/users',
    });
  }

  return tools;
}
```

Replace the component body's hook call and tool list construction:

```ts
export default function AdminHubScreen() {
  const insets = useSafeAreaInsets();
  const { isAdmin, isSuperAdmin, loading } = useUserRole();
  const ADMIN_TOOLS = buildAdminTools(isSuperAdmin);
```

(everything below — the `loading`/`!isAdmin`/main-return JSX — stays exactly as
it is; `isAdmin` here is now a plain `boolean`, not `boolean | null`, but the
existing `if (!isAdmin)` check still behaves correctly since `loading` is checked
first.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run the app (`npm run web` or `npm start`), sign in as `tymanskifilip@gmail.com`
(after Task 2's seed migration has been applied), navigate to `/admin`. Confirm a
third tile "Administrators" appears alongside "Court verification" and "User
reports", and tapping it opens `/admin/users` showing at least the signed-in
super admin's own row (filtered out of the default "Admins" view since their role
is `super_admin`, not `admin` — switch to the "Super admins" chip to see them).
Sign in as a plain user (or log out) and confirm the "Administrators" tile does
NOT appear and `/admin/users` shows the `notSuperAdmin` denial message if
navigated to directly.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/index.tsx"
git commit -m "Add Administrators tile to admin hub for Super Admins"
```

---

## Task 10: End-to-end manual verification

No new files — this task walks through the design spec's testing checklist
(`docs/superpowers/specs/2026-08-09-tournament-phase1-roles-admin-design.md`,
"Testing" section) against the real app + Supabase project, using two throwaway
test accounts in addition to the seeded super admin.

**Interfaces:**
- Consumes: everything from Tasks 1-9.

- [ ] **Step 1: Grant/audit round-trip in the UI**

As `tymanskifilip@gmail.com` on `/admin/users`, switch to "Everyone", search for
a test account's nick, tap "Grant Admin", confirm the dialog, confirm the row
now shows role "Admin" and a "Remove Admin" button. In the SQL editor, run
`select * from public.admin_list_audit_log(null, 10);` (as postgres, or via
`select public.admin_list_audit_log(null, 10);` if using RPC-call syntax) and
confirm a `grant_admin` row exists for that user.

- [ ] **Step 2: Newly-granted admin sees admin tools but not user management**

Sign in as the newly-granted test account. Confirm `/admin` shows "Court
verification" and "User reports" but NOT "Administrators". Confirm navigating
directly to `/admin/users` shows the `notSuperAdmin` denial screen.

- [ ] **Step 3: Direct RPC call as non-super-admin is rejected**

While signed in as that admin (not super admin), open the browser devtools
console on the web build and run:
`await window.supabase.rpc('admin_set_user_role', { p_user_id: '<any-uuid>', p_role: 'admin' })`
(adjust to however `supabase` is exposed/importable in that environment, or run
the equivalent via React Native debugger). Expected: returns `'not_super_admin'`,
and the target row is unchanged in the database.

- [ ] **Step 4: Remove admin round-trip**

Back as the super admin, tap "Remove Admin" on that test account, confirm the
dialog, confirm the row reverts. Re-run the audit log query from Step 1 and
confirm a `revoke_admin` row now also exists.

- [ ] **Step 5: Super admin protection**

In the SQL editor, run
`select public.admin_set_user_role((select id from auth.users where email = 'tymanskifilip@gmail.com'), 'user');`
as if called by itself (this simulates the RPC being reachable — since it's run
as `postgres` here `is_super_admin()` will read whatever `auth.uid()` resolves to,
which is null outside a real request context, so expect `'not_authenticated'` in
the SQL editor). For the real check, redo this via Task 3's automated SQL test
(step 8, `super_admin protected OK`) — it is the authoritative verification of
this behavior since it correctly fakes `auth.uid()` as another super admin.

- [ ] **Step 6: Refresh persistence**

While on `/admin/users` as super admin, hard-refresh the browser page (web) or
reload the app. Confirm the screen re-authenticates, re-checks `isSuperAdmin`,
and reloads the same user list from the database — no client-only state is lost
or requires re-navigation.

- [ ] **Step 7: Confirm existing admin features still work**

As the same super admin account (who also satisfies `is_app_admin()` via the
synced `is_admin` flag), open `/admin/fields` and `/admin/reports` and confirm
both still function exactly as before this change — proving the `is_admin` sync
didn't regress the 15 existing files that depend on `is_app_admin()`.

No commit for this task — it's verification only. If any step fails, return to
the relevant earlier task, fix, and re-run this checklist from the affected step
onward.
