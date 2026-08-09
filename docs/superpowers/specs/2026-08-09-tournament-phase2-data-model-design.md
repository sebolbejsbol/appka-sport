# Phase 2: Tournament Data Model, Creation & Lifecycle — Design

Part of the "Advanced Tournament System" initiative (see `AGENTS.md` request). Phase 2 of 6:

1. ✅ Roles/permissions + admin user-management UI (done, merged, live)
2. **Tournament data model + creation/config + lifecycle states (this doc)**
3. Team registration flow
4. Groups, standings, match entry
5. Playoff bracket generation + auto-advancement
6. Public tournament page + responsive/mobile polish + audit log surfacing

Phase 2 builds the tournament "shell": the entity itself, its configuration, its
lifecycle, and the admin screens to create/edit/publish it. No teams, matches,
groups-with-standings, or brackets exist yet — those are later phases, built on
top of what this phase establishes.

## Context

Builds directly on Phase 1's conventions (see
`docs/superpowers/specs/2026-08-09-tournament-phase1-roles-admin-design.md`):
`is_app_admin()` gates admin-only writes, `SECURITY DEFINER` RPCs with
string-status-code returns for mutations, `admin_audit_log` for accountability,
plain numbered migrations applied manually via the Supabase SQL editor (or via
`scripts/run-supabase-sql.mjs`, added this session).

Reused existing conventions:
- Sport enum: `'basketball' | 'football' | 'volleyball' | 'handball'` — identical
  to `teams.sport` (`supabase/migrations/0032_teams.sql`) and
  `src/lib/sports.ts`'s `TEAM_SPORTS`.
- Logo upload: `src/lib/storage-upload.ts`'s `uploadImageToBucket`, and the
  bucket + RLS-policy pattern from `team-logos` (migration `0032`).
- Admin screen shape: `admin/reports.tsx`'s custom header + list + filter chips,
  `admin/users.tsx`'s search + confirm-dialog pattern (both Phase 1).
- Form conventions: `TextField` component, `Button` component, and the general
  shape of `events.ts`'s `NewEvent`/`EventUpdate` types + `mapXRow` functions.

**Note on "any ADMIN, not just SUPER_ADMIN":** the original request's §3/§16
consistently describes tournament management as an `ADMIN` capability (only
role *grants* are Super-Admin-only). This phase's RPCs gate on `is_app_admin()`
(true for `admin` or `super_admin`), matching that.

## Data model

### `tournaments`

```sql
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),

  -- Basic information
  name text not null,
  description text,
  logo_url text,
  sport text not null default 'basketball'
    check (sport in ('basketball', 'football', 'volleyball', 'handball')),
  event_date date not null,
  start_time time not null,
  end_time time,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz not null,
  location_name text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  contact_info text,

  -- Configuration
  max_teams integer not null check (max_teams between 2 and 128),
  min_teams integer not null default 2 check (min_teams >= 2),
  players_per_team integer not null default 5 check (players_per_team between 1 and 30),
  substitutes_per_team integer not null default 0 check (substitutes_per_team between 0 and 15),
  requires_approval boolean not null default false,
  points_win integer not null default 3,
  points_draw integer not null default 1,
  points_loss integer not null default 0,
  allow_draws boolean not null default true,

  -- Lifecycle
  status text not null default 'draft' check (status in (
    'draft', 'registration_open', 'registration_closed',
    'ready', 'in_progress', 'completed', 'cancelled'
  )),
  champion_team_id uuid,  -- FK added in Phase 3 once tournament_teams exists

  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tournaments_name_length check (char_length(trim(name)) between 3 and 100),
  constraint tournaments_min_le_max check (min_teams <= max_teams),
  constraint tournaments_registration_window check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_opens_at < registration_closes_at
  )
);

create index tournaments_status_idx on public.tournaments (status);
create index tournaments_event_date_idx on public.tournaments (event_date);
```

`champion_team_id` is declared now (nullable, no FK constraint yet — the
`tournament_teams` table it will reference doesn't exist until Phase 3) so
Phase 5 doesn't need another `alter table`. Standard `set_updated_at()` trigger
(already defined in migration `0001`) is reattached here.

### `tournament_groups`

```sql
create table public.tournament_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,

  constraint tournament_groups_name_length check (char_length(trim(name)) between 1 and 40),
  constraint tournament_groups_unique_name unique (tournament_id, name)
);

create index tournament_groups_tournament_idx on public.tournament_groups (tournament_id);
```

Deliberately minimal: no `team_ids`, no standings columns. Phase 4 adds the
team-to-group assignment (via a column or join table on `tournament_teams`,
decided in that phase) and computes standings from `matches` at read time —
never stored as a blob, per the original request's §15.

Admins choose the group count and names at creation/edit time (before
registration even closes); this table is populated then. A tournament with
`group_count = 1` still gets exactly one `tournament_groups` row — no special
"no groups" case, keeping every later phase's queries uniform.

### RLS

```sql
alter table public.tournaments enable row level security;
alter table public.tournament_groups enable row level security;

-- Published tournaments are visible to any authenticated user; drafts/cancelled
-- are admin-only (consistent with "spectators follow published tournaments").
create policy "Published tournaments are viewable by authenticated users"
  on public.tournaments for select
  to authenticated
  using (status not in ('draft', 'cancelled') or public.is_app_admin());

create policy "Groups follow their tournament's visibility"
  on public.tournament_groups for select
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.status not in ('draft', 'cancelled') or public.is_app_admin())
    )
  );

-- No insert/update/delete policies on either table: all writes go through
-- SECURITY DEFINER RPCs below, exactly like admin_audit_log in Phase 1.
```

### Storage: `tournament-logos` bucket

Same shape as `team-logos` (migration `0032`), but the upload/update policy
checks `is_app_admin()` instead of `is_team_manager()`:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-logos', 'tournament-logos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Admins upload tournament logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-logos' and public.is_app_admin());

create policy "Admins update tournament logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'tournament-logos' and public.is_app_admin());

create policy "Public read tournament logos"
  on storage.objects for select to authenticated
  using (bucket_id = 'tournament-logos');
```

## Backend (SQL functions)

All in migration `0071_tournaments.sql`. All mutating functions:
`is_app_admin()`-gated, string-status-code return, write an `admin_audit_log`
row on success (`entity_type = 'tournament'`).

- **`admin_create_tournament(p_name, p_description, p_logo_url, p_sport, p_event_date, p_start_time, p_end_time, p_registration_opens_at, p_registration_closes_at, p_location_name, p_address, p_city, p_latitude, p_longitude, p_contact_info, p_max_teams, p_min_teams, p_players_per_team, p_substitutes_per_team, p_requires_approval, p_points_win, p_points_draw, p_points_loss, p_allow_draws, p_group_names text[])
  returns table(status text, tournament_id uuid)`** — validates `is_app_admin()`,
  inserts the `tournaments` row (`status = 'draft'`, `created_by = auth.uid()`),
  inserts one `tournament_groups` row per element of `p_group_names` (min 1,
  max 16), logs `create_tournament`, returns `('ok', new_id)`. On validation
  failure (e.g. empty group name, `p_max_teams < p_min_teams` — though the DB
  constraint would catch this too) returns `('invalid_input', null)` before
  attempting the insert, so the client gets a clean status rather than a raw
  Postgres constraint-violation error.

- **`admin_update_tournament(p_tournament_id, ...same fields as create, p_group_names text[]) returns text`**
  — status codes: `'ok' | 'not_admin' | 'not_found' | 'invalid_input' |
  'locked'`. `'locked'` when `status not in ('draft', 'registration_open')` —
  matches the original request's §13 ("cannot modify fundamental tournament
  structure after matches have started"). Replaces the tournament row's fields
  and fully replaces `tournament_groups` (delete-then-reinsert by name, keeping
  it simple since no teams reference groups yet in this phase). Logs
  `update_tournament` with a metadata diff of changed top-level fields.

- **`admin_set_tournament_status(p_tournament_id, p_new_status) returns text`**
  — status codes: `'ok' | 'not_admin' | 'not_found' | 'invalid_transition'`.
  Enforces the legal transition graph as an explicit table (not just "any
  status to any status"):
  ```
  draft            -> registration_open, cancelled
  registration_open -> registration_closed, cancelled
  registration_closed -> ready, registration_open, cancelled
    (back to registration_open covers "admin reopens registration")
  ready            -> in_progress, cancelled
  in_progress      -> completed, cancelled
  completed        -> (terminal, no transitions)
  cancelled        -> (terminal, no transitions)
  ```
  Additional guards beyond the graph:
  - `registration_closed -> ready` requires `is_app_admin()` obviously, but
    Phase 2 does NOT yet check team counts (no teams exist yet) — Phase 3/4
    will tighten this guard once `tournament_teams` exists, per the original
    request's "cannot start tournament without enough approved teams." This
    phase's job is just the state machine's shape being correct and extensible.
  - Logs `set_tournament_status` with `{ from, to }` metadata.

- **`get_tournament_detail(p_tournament_id) returns table(...)`** — `stable`,
  no admin gate (relies on the table's RLS policy, so a draft is simply
  invisible/`not found` to a non-admin rather than erroring). Returns every
  tournament column plus a nested `groups` array (via `jsonb_agg` of
  `tournament_groups` rows, ordered by `sort_order` — the one place this phase
  uses JSON, for a small, bounded, read-only convenience payload, not as the
  system of record). `elsif not found then` → empty result set, client treats
  as "not found or not visible."

- **`list_tournaments(p_status_filter text default null, p_admin_view boolean default false, p_limit integer default 50, p_offset integer default 0) returns table(..., total_count bigint)`**
  — `stable`. When `p_admin_view` is true, requires `is_app_admin()` (raises
  `not_admin` otherwise) and includes drafts/cancelled; when false, relies on
  RLS (already filters to published-only) so any authenticated user gets the
  public list. `p_status_filter` narrows to one status; null returns all
  visible ones. Used by both `/admin/tournaments` (admin_view=true) and a
  future public tournaments index (admin_view=false — not built this phase,
  but the RPC supports it so Phase 6 doesn't need a new one).

## Frontend

### `src/lib/tournaments.ts` (new)

Types (`Tournament`, `TournamentGroup`, `TournamentStatus`, `NewTournament`,
`TournamentUpdate`) and RPC wrappers (`createTournament`, `updateTournament`,
`setTournamentStatus`, `getTournamentDetail`, `listTournaments`), following
`events.ts`'s shape (`mapTournamentRow`, defensive `unknown -> union` narrowing
exactly like `mapEventSummaryRow`/`mapUserRow`).

### `src/lib/tournament-storage.ts` (new)

`uploadTournamentLogo(tournamentId, uri, mimeType, base64)` — one-to-one copy
of `team-storage.ts`'s `uploadTeamLogo`, targeting the `tournament-logos`
bucket.

### `src/app/(app)/admin/tournaments/index.tsx` (new)

Admin-only list (gated like `admin/users.tsx` but on `isAdmin`, not
`isSuperAdmin` — reuses `useUserRole`). Status filter chips (`All / Draft /
Registration Open / ... `), each row shows name, sport, date, status badge,
tappable through to edit. A floating "+ Create" action (matching
`ScreenHeader`'s `rightActions` `primary` pattern) links to
`/admin/tournaments/create`.

### `src/app/(app)/admin/tournaments/create.tsx` (new)

Multi-section form (Basic Information / Configuration / Groups), built with
existing `TextField`/`Button`, plus:
- A date picker and two time pickers for `event_date`/`start_time`/`end_time`
  — reuses whatever RN date/time picker component `create-event-screen.tsx`
  already uses (`@react-native-community/datetimepicker`, confirmed present as
  a dependency), not a new library.
- Two more date/time pickers for the registration window.
- Numeric steppers or plain numeric `TextField`s (`keyboardType="numeric"`) for
  `max_teams`/`min_teams`/`players_per_team`/`substitutes_per_team`.
- A dynamic group-name list: starts with one input ("Group A" placeholder),
  "+ Add group" button appends another, each has a remove button (disabled
  when only one remains) — this is what makes "flexible group count, not
  hardcoded to A/B" concrete in the UI.
- Logo picker reusing `pickImageFromLibrary` (from `src/lib/pick-image.ts`,
  already used by team settings).
- On submit: uploads the logo first (if picked) to get a `logo_url`, then calls
  `createTournament(...)`. On success, navigates to
  `/admin/tournaments/[id]/edit`.

### `src/app/(app)/admin/tournaments/[id]/edit.tsx` (new)

Same form as create, pre-filled via `getTournamentDetail`, calling
`updateTournament` on submit. Disabled (with an explanatory note) once
`status` is no longer `draft`/`registration_open`, matching the RPC's
`'locked'` result. Below the form: a status-transition panel — buttons for
each legal next status from the current one (derived from the same transition
table, mirrored in `src/lib/tournaments.ts` as a plain object so the UI only
ever offers legal moves), each behind an `Alert.alert` confirmation (matching
Phase 1's pattern for destructive/significant actions), calling
`setTournamentStatus`.

### `src/app/(app)/tournament/[id].tsx` (new)

Public detail page, deliberately minimal this phase: header (name, logo, sport
badge, status badge), basic info block (description, date/time, location,
address, city, contact, registration window), and a
`X / Y teams registered` style placeholder line reading directly off
`max_teams` (teams/registration don't exist until Phase 3, so this shows
`0 / {max_teams} teams registered` for now — Phase 3 wires the real count).
No groups/standings/matches/bracket sections yet (Phase 4-6). Visible to any
authenticated user for non-draft tournaments (enforced by RLS via
`get_tournament_detail`).

### `/admin` hub update

Add a `tournaments` tool (`path: '/admin/tournaments'`), visible whenever
`isAdmin` is true (not gated to `isSuperAdmin`, unlike the Phase 1
`users` tile) — matches "ADMIN can create/manage tournaments."

### i18n

New `admin.tournamentsTitle`/`admin.tournamentsHint` (hub tile) and
`adminTournaments.*` / `tournamentForm.*` / `tournamentDetail.*` namespaces in
both `en.ts` and `pl.ts` (status labels, form field labels, transition button
labels, confirmation copy).

## Security summary (maps to spec §16)

| Requirement | Enforcement |
|---|---|
| Normal users can't create tournaments | `admin_create_tournament` checks `is_app_admin()` server-side, raises/returns `not_admin` otherwise |
| Normal users can't modify tournaments | Same for `admin_update_tournament`/`admin_set_tournament_status`; no direct table INSERT/UPDATE/DELETE policies exist at all, so even a misconfigured RLS gap can't be exploited — the tables have zero write policies |
| Can't manipulate results via direct API requests | N/A yet (no results exist until Phase 4) — the pattern (RPC-only writes, zero direct-write policies) is what will protect match results too |
| Server-side authorization | All checks in Postgres, not React Native |

## Testing (maps to spec §25, the applicable subset)

1. As admin: create a tournament with 3 groups ("Group A", "Group B", "Group
   C") → `admin_create_tournament` returns `ok` + a UUID → row exists with
   `status = 'draft'`, 3 `tournament_groups` rows in the right order.
2. As admin: edit that draft, change `max_teams` → `admin_update_tournament`
   returns `ok`, value persisted.
3. As admin: walk the status machine `draft -> registration_open ->
   registration_closed -> ready -> in_progress -> completed`, confirming each
   call returns `ok` and an illegal jump (e.g. `draft -> in_progress`) returns
   `invalid_transition`.
4. As admin: attempt `admin_update_tournament` on an `in_progress` tournament
   → `locked`.
5. As a normal (non-admin) user: attempt `admin_create_tournament` → `not_admin`,
   no row created. Attempt to `select` a `draft` tournament directly → RLS
   returns zero rows.
6. As a normal user: `select` a `registration_open` tournament → visible.
7. Refresh `/admin/tournaments/[id]/edit` mid-session → state reloads fully
   from `get_tournament_detail`, no client-only state lost.
8. `admin_audit_log` contains `create_tournament`, `update_tournament`, and one
   `set_tournament_status` row per transition performed above.

## Out of scope for Phase 2

- Team registration, `tournament_teams`, approval flow (Phase 3).
- Groups actually containing teams, standings computation, group matches
  (Phase 4).
- Playoff bracket, `tournament_rounds`, `bracket_slots`, auto-advancement
  (Phase 5).
- The full public page (groups/standings/matches/bracket sections), champion
  display, responsive bracket UI (Phase 6).
- Tightening `registration_closed -> ready` to actually check team counts
  (deferred to Phase 3/4, noted above).
