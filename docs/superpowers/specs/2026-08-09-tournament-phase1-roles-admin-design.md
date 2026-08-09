# Phase 1: Roles & Admin Management — Design

Part of the larger "Advanced Tournament System" initiative (see `AGENTS.md` request). This
is phase 1 of 6:

1. **Roles/permissions (this doc) + admin user-management UI**
2. Tournament data model + creation/config + lifecycle states
3. Team registration flow
4. Groups, standings, match entry
5. Playoff bracket generation + auto-advancement
6. Public tournament page + responsive/mobile polish + audit log surfacing

Phase 1 lays the security foundation every later phase depends on: a real role system
(`USER` / `ADMIN` / `SUPER_ADMIN`) enforced in Postgres, a Super Admin UI to manage who
holds `ADMIN`, and a generic audit log table that later phases will also write to.

## Context (existing architecture)

- **Stack**: Expo Router app (React Native + `react-native-web`), Supabase (Postgres +
  RLS) as the backend. There is no separate API server — authorization is enforced with
  Postgres RLS policies and `SECURITY DEFINER` RPC functions called directly from the
  client via the Supabase JS SDK. Migrations are plain numbered `.sql` files under
  `supabase/migrations/`, applied manually via the Supabase Dashboard SQL editor
  (see header comments in existing migrations).
- **Current admin flag**: `profiles.is_admin boolean`, added in `0008_event_detail_admin.sql`.
  A trigger (`profiles_protect_admin`, migrations `0020`/`0021`/`0043`/`0068`) blocks any
  client-originated `UPDATE`/`INSERT` from changing `is_admin` (it force-resets
  `new.is_admin := old.is_admin` unless `current_user in ('postgres', 'supabase_admin')`).
  `SECURITY DEFINER` functions execute as their owner (`postgres`, since all migrations are
  run as `postgres` via the SQL editor), so a `SECURITY DEFINER` RPC can legitimately flip
  `is_admin` — that's the sanctioned path today, and the same mechanism this design reuses
  for `role`.
  `public.is_app_admin()` (SQL, `stable`, `security definer`) reads `profiles.is_admin` and
  is referenced by RLS policies across 15 migration files (fields moderation, event admin,
  user reports, etc.).
- **Existing admin surface**: `/admin` hub (`src/app/(app)/admin/index.tsx`), gated by the
  `useIsAdmin()` hook, linking to `/admin/fields` and `/admin/reports`. `admin/reports.tsx`
  is the closest prior art for phase 1's new screen: per-screen admin-flag check, `FlatList`
  + filter chips, `lib/admin-reports.ts` wrapping RPCs with typed results and string status
  codes (`'ok' | 'not_admin' | 'not_found' | ...`) that the UI switches on.
- **Confirmation dialogues**: `Alert.alert(...)` from `react-native` is the standing pattern
  for destructive-action confirmation (used in `teams/[id]/settings.tsx` and others).
- **i18n**: `src/i18n/{en,pl}.ts`, accessed via `t('namespace.key')`.

## Data model

### `profiles.role`

```sql
alter table public.profiles
  add column if not exists role text not null default 'user'
  check (role in ('user', 'admin', 'super_admin'));
```

`is_admin` is **kept** and stays automatically in sync with `role` (`is_admin = true` iff
`role in ('admin', 'super_admin')`), written by the same statement that sets `role` inside
the new grant/revoke RPC. This means all 15 existing files that consume `is_app_admin()` /
`profiles.is_admin` keep working completely unchanged — zero risk to current admin features
(fields moderation, event admin, user reports).

The existing `profiles_protect_admin` trigger is extended to also lock `role` on any
client-originated `UPDATE`/`INSERT`, exactly like it already locks `is_admin` and `nick`:

```sql
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
```

This is defense in depth: the RPC below is the only sanctioned way to change `role`, but
even a direct table update (should RLS ever be misconfigured) cannot self-grant a role.

### `admin_audit_log`

Generic table, so later phases (tournament create/edit, team approval, match result entry)
reuse it without another migration:

```sql
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  action text not null,               -- e.g. 'grant_admin', 'revoke_admin'
  entity_type text not null,          -- e.g. 'user'; later: 'tournament', 'team', 'match'
  entity_id uuid,                     -- target row id (nullable for actions with no single target)
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_entity_idx
  on public.admin_audit_log (entity_type, entity_id);
create index if not exists admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id);

alter table public.admin_audit_log enable row level security;
-- No policies: RLS with zero policies denies all direct client access (both
-- select and insert/update/delete). All access goes through SECURITY DEFINER
-- RPCs, which bypass RLS by nature of running as the table owner.
```

## Backend (SQL functions)

All in a new migration `0069_admin_roles.sql`.

- **`public.is_super_admin() returns boolean`** — `stable security definer`, mirrors
  `is_app_admin()`: `select coalesce((select role = 'super_admin' from profiles where id =
  auth.uid()), false)`.

- **`public.admin_list_users(p_search text default null, p_role_filter text default null, p_limit int default 50, p_offset int default 0)`**
  — `stable security definer`. Requires `is_super_admin()`, else raises `not_super_admin`.
  Joins `auth.users` for `email`. `p_search` matches `nick` or `email` (`ilike`).
  `p_role_filter` restricts to `'admin'`, `'super_admin'`, or `null` for all. Returns
  `id, nick, email, avatar_url, role, created_at, total_count` (window `count(*) over()` for
  pagination). `p_limit` clamped to `[1, 100]`.

- **`public.admin_set_user_role(p_user_id uuid, p_role text) returns text`** —
  `security definer`. Status-code return, matching the `admin_update_user_report`
  convention:
  - `not_authenticated` if `auth.uid()` is null.
  - `not_super_admin` if caller isn't super admin.
  - `invalid_role` if `p_role not in ('user', 'admin')` — **`super_admin` can never be set
    through this function**, closing off the "grant yourself/anyone super admin" path
    entirely at the database level.
  - `not_found` if target user doesn't exist.
  - `target_is_super_admin` if the target's current role is `'super_admin'` — a super admin
    can never be demoted or have their role touched through this function. This is what
    structurally satisfies "never remove the last super admin": super admins are simply
    unreachable via this RPC, so there's nothing to accidentally remove.
  - `no_change` if target already has `p_role`.
  - On success: updates `role` and the synced `is_admin` in one statement, inserts an
    `admin_audit_log` row (`action = 'grant_admin'` or `'revoke_admin'`, `entity_type =
    'user'`, `entity_id = p_user_id`, `metadata = jsonb_build_object('previous_role',
    v_old_role, 'new_role', p_role)`), returns `'ok'`.

- **`public.admin_list_audit_log(p_entity_type text default null, p_limit int default 50)`**
  — `stable security definer`, `is_super_admin()`-gated. Returns log rows joined with actor
  nick, newest first. (Minimal viewer for phase 1; a dedicated UI page is optional — see
  Frontend below.)

All functions: `revoke all ... from public; grant execute ... to authenticated;`, plus
`notify pgrst, 'reload schema';` at the end of the migration, matching existing convention.

### Seed migration

Second migration, `0070_seed_first_super_admin.sql`:

```sql
update public.profiles
set role = 'super_admin', is_admin = true
where id = (select id from auth.users where email = 'tymanskifilip@gmail.com');
```

Run as `postgres` in the SQL editor, so it bypasses the protection trigger exactly like
migration `0008`'s original admin seed did.

## Frontend

### `src/lib/admin-users.ts` (new)

Typed wrappers over the three RPCs above, following `src/lib/admin-reports.ts`'s shape:
`AdminUserRow`, `getAdminUserList(search, roleFilter, limit, offset)`,
`setUserRole(userId, role): Promise<'ok' | 'not_super_admin' | 'invalid_role' | 'not_found' | 'target_is_super_admin' | 'no_change' | 'error'>`.

### `src/hooks/use-is-super-admin.ts` (new)

Same shape as `useIsAdmin`, backed by a new `getProfileRole(userId)` helper in
`src/lib/profiles.ts` (selects `role` instead of `is_admin`). Returns
`{ role, isAdmin, isSuperAdmin, loading }` so a single fetch serves both checks.

### `src/app/(app)/admin/users.tsx` (new)

Super-Admin-only screen (redirect/deny message otherwise, same pattern as
`admin/reports.tsx`'s `!isAdmin` branch):

- `ScreenHeader` with back nav (`goBack('/admin')`).
- Search input (debounced) over nick/email.
- Filter chips: `All admins` (default — role in admin/super_admin) / `Super admins` /
  `Everyone` (search-only mode to find a user to promote).
- `FlatList` rows: nick, email, role badge, "Grant Admin" or "Remove Admin" button
  depending on current role. Super admin rows show a role badge only, no action buttons
  (they're not actionable from this screen, matching the RPC's restriction).
- Both actions go through `Alert.alert` confirmation before calling `setUserRole`.
- Handles the RPC's status codes: `not_super_admin` → show denial + flip local
  `isSuperAdmin` to false (matches `admin/reports.tsx`'s handling of `not_admin`);
  `no_change` → silent refresh; other non-`ok` → generic error text.
- Pagination: simple "Load more" (offset-based, matching `total_count`), no infinite
  scroll machinery needed for an admin list.

### `/admin` hub update

`src/app/(app)/admin/index.tsx`: add a `users` tool (`path: '/admin/users'`), included in
`buildAdminTools()` only when `isSuperAdmin` is true. This requires switching the hub from
`useIsAdmin` to the new `useIsSuperAdmin`-capable hook (or calling both) so it can
distinguish "not logged in as any admin" (existing denial screen) from "admin but not super
admin" (sees `fields`/`reports` only, not `users`).

### i18n

New `admin.usersTitle` / `admin.usersHint` (hub tile) and an `adminUsers.*` namespace
(search placeholder, filter labels, grant/remove button labels, confirm dialog copy, status
messages) added to both `en.ts` and `pl.ts`.

## Security summary (maps to spec §16)

| Requirement | Enforcement |
|---|---|
| Normal users can't grant themselves ADMIN | `role`/`is_admin` locked by trigger on every client-originated write; only reachable via `admin_set_user_role`, which itself requires `is_super_admin()` |
| ADMIN can't grant themselves SUPER_ADMIN | `admin_set_user_role` rejects any `p_role` other than `'user'`/`'admin'` — `super_admin` is not a settable value through any RPC |
| Only SUPER_ADMIN can grant/remove ADMIN | Every mutating RPC checks `is_super_admin()` server-side and raises/returns an error code otherwise |
| Can't accidentally remove the last SUPER_ADMIN | `admin_set_user_role` refuses to touch any row whose current role is `super_admin` at all |
| Frontend gating isn't the only protection | All checks above are enforced in Postgres; the UI hides buttons for UX only, mirroring the existing `is_app_admin()` pattern already used for fields/reports |

## Testing (maps to spec §25 items 1, 20–22)

1. Run migrations; confirm `tymanskifilip@gmail.com` has `role = 'super_admin'`.
2. As super admin: search a user, grant `ADMIN` → row updates, audit log row appears
   (via `admin_list_audit_log` or direct SQL check), user's `is_admin` is now `true` (so
   existing `/admin` hub and fields/reports tools work for them unchanged).
3. As the newly granted admin: confirm `/admin/users` is NOT visible/accessible
   (`is_super_admin()` false) but `/admin/fields` and `/admin/reports` still are.
4. As that admin, attempt to call `admin_set_user_role` directly (e.g. via browser
   devtools against the Supabase client) → expect `not_super_admin`, no row changes.
5. As super admin, remove ADMIN from that user → `role` reverts to `user`, `is_admin`
   reverts to `false`, audit log records `revoke_admin`.
6. Attempt `admin_set_user_role` targeting the seeded super admin (from a second super
   admin, if one exists, or by direct RPC call) → expect `target_is_super_admin`, no change.
7. Refresh `/admin/users` mid-session → state fully reloads from the RPCs (no client-only
   state), confirming persistence.

## Out of scope for Phase 1

- Granting/transferring `SUPER_ADMIN` itself — dashboard-only operation for now, matching
  the spec's UI which only calls for Grant/Remove **Admin**.
- Any tournament-specific permission (e.g. "can manage tournament X") — phase 2+.
- A dedicated audit-log *page*; `admin_list_audit_log` exists for later phases to build a
  UI against once there's enough log volume to be worth a screen.
