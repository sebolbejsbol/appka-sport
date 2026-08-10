# Phase 3: Team Registration Flow — Design

Part of the "Advanced Tournament System" initiative. Phase 3 of 6:

1. ✅ Roles/permissions + admin user-management UI (done, merged, live)
2. ✅ Tournament data model + creation/config + lifecycle states (done, merged, live)
3. **Team registration flow (this doc)**
4. Groups, standings, match entry
5. Playoff bracket generation + auto-advancement
6. Public tournament page + responsive/mobile polish + audit log surfacing

Phase 3 lets an existing team register to compete in a tournament, subject to
admin approval, and lets the admin optionally place an approved team into one
of the tournament's existing groups (no standings/points math yet — that's
Phase 4). No matches, no group tables, no bracket exist yet.

## Context

**Important discovery made while designing this phase:** this repo's
`supabase/migrations/` directory is not a complete record of the live
schema. The existing team join-request system (`team_join_requests` table;
`request_join_team`, `cancel_join_request`, `list_team_join_requests`,
`respond_team_join_request` functions; `is_team_manager`/`is_team_member`
helpers) has **no corresponding migration file anywhere in git history** —
it was created directly against the live database before this project
switched to migration-file-based changes. All function/table shapes below
were pulled directly from the live database via `pg_get_functiondef` and
`information_schema.columns`, not inferred from local files. Anyone
implementing this phase should do the same for any further reuse — do not
assume a local migration file is authoritative for pre-Phase-1 schema.

Builds directly on Phase 2's conventions
(`docs/superpowers/specs/2026-08-09-tournament-phase2-data-model-design.md`):
`is_app_admin()` gates admin-only writes, `SECURITY DEFINER` RPCs with
string-status-code returns, `admin_audit_log` for accountability, plain
numbered migrations applied via `scripts/run-supabase-sql.mjs`.

**Deliberate convention choice:** the existing team-side join-request RPCs
use a bespoke per-action status vocabulary (`'sent'`, `'accepted'`,
`'rejected'`, `'not_authenticated'`, `'already_member'`, ...) rather than
Phase 1/2's `'ok' | 'not_admin' | ...` convention. Phase 3's new RPCs
follow **Phase 1/2's convention** (`'ok'` on success, specific failure
codes otherwise) for consistency within the tournament system itself, since
every other tournament RPC a future implementer will read uses that shape.
Existing helpers (`is_team_manager`, `is_app_admin`) are reused as-is —
only the new RPCs' *return convention* differs from their team-domain
neighbors, not the underlying permission logic.

Reused existing conventions/tables (confirmed live, not assumed):
- `teams` (`id`, `name`, `logo_url`, `sport text`, `owner_id`, ...) and
  `team_members` (`team_id`, `user_id`, `role text` — `'owner'|'admin'|'member'`)
  — `sport` is unconstrained `text` matching the same 4 values used
  elsewhere (`basketball`/`football`/`volleyball`/`handball`), not a DB
  check constraint, so Phase 3 doesn't need to loosen anything to allow it.
- `public.is_team_manager(p_team_id, p_user_id) returns boolean` — true for
  `'owner'` or `'admin'` role. This is the exact gate for "can this user
  register/withdraw this team," reused verbatim.
- `public.is_app_admin()` — unchanged from Phase 1/2, gates all admin-only
  mutations below.
- `tournaments` (`status`, `sport`, `max_teams`, `min_teams`,
  `requires_approval`) and `tournament_groups` (`id`, `tournament_id`,
  `name`, `sort_order`) from Phase 2 — read-only from this phase's
  perspective except for the `registration_closed -> ready` transition
  check described below.
- `admin_audit_log` — every mutation below logs to it, matching Phase 1/2.
- `src/lib/teams.ts`'s `listMyTeams()` (already returns `my_role` per team)
  — the client already has everything needed to compute "which of my teams
  can register" (role is `'owner'`/`'admin'`, sport matches) without a new
  RPC for that specific question.

## Data model

### `tournament_teams`

One row per (tournament, team) pair — registering again after a withdrawal
reuses the same row rather than inserting a new one, so the full history
(who requested, when, who responded) survives in one place.

```sql
create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  group_id uuid references public.tournament_groups (id) on delete set null,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),

  requested_by uuid not null references auth.users (id) on delete restrict,
  responded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint tournament_teams_unique unique (tournament_id, team_id)
);

create index if not exists tournament_teams_tournament_idx
  on public.tournament_teams (tournament_id);
create index if not exists tournament_teams_team_idx
  on public.tournament_teams (team_id);
```

RLS: enabled, defense-in-depth only (same posture as `tournaments` itself —
every real access path goes through the RPCs below, which apply the actual
visibility rules explicitly since they're `security definer` and bypass
RLS regardless). A `select` policy mirrors "approved rows are visible to
authenticated users; every row is visible to the tournament's admins and to
the registering team's own managers" — but since no RPC ever does a raw
`select * from tournament_teams`, this is genuinely just a safety net
against a client bypassing the RPC layer, identical in spirit to Phase 2's
`tournaments` RLS policy.

`group_id` starts `null` on every new registration; only
`admin_assign_team_group` ever sets it, and only for `approved` rows (a
`pending`/`rejected`/`withdrawn` team can't usefully be "in a group").

## RPCs

All `security definer`, all `revoke all ... from public; grant execute ...
to authenticated;`, all end with a schema-reload notify, matching Phase 2's
migration convention exactly.

- **`register_team_for_tournament(p_tournament_id uuid, p_team_id uuid)
  returns text`** — `'ok' | 'not_team_manager' | 'tournament_not_found' |
  'team_not_found' | 'not_open' | 'wrong_sport' | 'already_registered' |
  'tournament_full'`.
  - `not_team_manager`: caller fails `is_team_manager(p_team_id, auth.uid())`.
  - `not_open`: tournament's `status <> 'registration_open'`.
  - `wrong_sport`: `teams.sport <> tournaments.sport` for the two rows.
  - `already_registered`: an existing row for this pair has status
    `'pending'` or `'approved'` (a `'rejected'`/`'withdrawn'` row is fine to
    re-register over).
  - `tournament_full`: count of `'approved'` rows for this tournament is
    already `>= max_teams`. (Only blocks *new* registration attempts once
    full — an admin can still see and act on pending requests submitted
    before the tournament filled up; whether to auto-reject those is an
    admin decision via `admin_respond_team_registration`, not automatic.)
  - On success: `insert ... on conflict (tournament_id, team_id) do update
    set status = 'pending', requested_by = excluded.requested_by, created_at
    = now(), responded_at = null, responded_by = null, group_id = null`
    (the `on conflict` branch is what makes re-registering after a
    withdrawal or rejection work over the same row). If
    `tournaments.requires_approval = false`, insert directly with `status =
    'approved'` instead of `'pending'` (skips the manual approval step
    entirely for tournaments that opted out of it — `requires_approval` is
    an existing Phase 2 column, previously unused; this is its first real
    consumer).
  - Logs `register_team` to `admin_audit_log` with `actor_id = auth.uid()`
    (a team manager, not necessarily an app admin — `admin_audit_log`
    already stores arbitrary actor ids, this isn't new).

- **`withdraw_team_registration(p_tournament_id uuid, p_team_id uuid)
  returns text`** — `'ok' | 'not_team_manager' | 'not_registered'`.
  Sets `status = 'withdrawn'` on a `'pending'` or `'approved'` row; returns
  `not_registered` if no such row exists in an eligible status. No
  tournament-status gate — a team can withdraw at any point up to
  `in_progress` (once a tournament is `in_progress`, later phases will need
  to decide what a "withdrawal" even means mid-competition; Phase 3 doesn't
  block it here, since nothing yet depends on roster stability during
  play — a deliberate, documented gap for Phase 4/5 to close if needed, not
  an oversight).

- **`admin_respond_team_registration(p_registration_id uuid, p_accept
  boolean) returns text`** — `'ok' | 'not_admin' | 'not_found' |
  'not_pending' | 'tournament_full'`. `tournament_full` only applies when
  `p_accept = true` and approving would exceed `max_teams` — re-checked
  here (not just at registration time) because multiple teams can be
  `pending` simultaneously near the cap. Sets `status = 'approved'` or
  `'rejected'`, `responded_at = now()`, `responded_by = auth.uid()`. Logs
  `approve_team_registration`/`reject_team_registration`.

- **`admin_remove_team_registration(p_registration_id uuid) returns text`**
  — `'ok' | 'not_admin' | 'not_found'`. For kicking an already-`'approved'`
  team (no-show, disqualification) — sets `status = 'rejected'`,
  `responded_at = now()`, `responded_by = auth.uid()`, `group_id = null`.
  Reuses `'rejected'` rather than adding a fifth status value — from the
  registering team's perspective from this point forward, "rejected" and
  "no longer in the tournament" are the same displayed state, and the
  audit log (`remove_team_registration`, a distinct action name) is what
  actually distinguishes "never got in" from "was removed after being in."

- **`admin_assign_team_group(p_registration_id uuid, p_group_id uuid)
  returns text`** — `'ok' | 'not_admin' | 'not_found' | 'not_approved' |
  'invalid_group'`. `p_group_id` may be `null` (unassign). `invalid_group`:
  the group doesn't belong to the same tournament as the registration.
  `not_approved`: registration status isn't `'approved'`. Logs
  `assign_team_group`.

- **`list_tournament_team_registrations(p_tournament_id uuid, p_admin_view
  boolean default false) returns table (id uuid, team_id uuid, team_name
  text, team_logo_url text, team_sport text, status text, group_id uuid,
  group_name text, requested_by uuid, created_at timestamptz, responded_at
  timestamptz)`** — `p_admin_view = true` requires `is_app_admin()` (raises
  like `list_tournaments` does), returns every row regardless of status.
  `p_admin_view = false` (public) returns only `status = 'approved'` rows —
  this is what powers the public tournament page's "Registered teams"
  section and the live team count.

- **`get_my_team_registration_status(p_tournament_id uuid, p_team_id uuid)
  returns text`** — returns the row's `status` if one exists for a team the
  caller manages (`is_team_manager` check), else `'none'`. No admin/audit
  concerns — a plain read used purely to drive the public page's
  register/pending/approved/rejected/withdraw button state for a signed-in
  team manager, without exposing a whole `list`-shaped RPC for a single
  boolean-ish question.

## Closing an existing Phase 2 gap

Phase 2's own design doc flagged, under "Out of scope": *"Tightening
`registration_closed -> ready` to actually check team counts (deferred to
Phase 3/4)."* Phase 3 introduces the data this check needs, so it closes it
here: `admin_set_tournament_status`'s existing transition logic (Phase 2's
`0071_tournaments.sql`) gets one added condition — when transitioning
`'registration_closed' -> 'ready'`, additionally require `count(*) from
tournament_teams where tournament_id = p_tournament_id and status =
'approved') >= min_teams`, returning a new status code `'not_enough_teams'`
if the check fails (distinct from the existing `'invalid_transition'`,
since the transition itself is legal — it's just blocked by a business
rule, matching the existing `'locked'` precedent for
`admin_update_tournament`'s own business-rule-vs-state-machine distinction).
This requires modifying `admin_set_tournament_status` in a new migration
(`create or replace function`, no column-shape change so no `drop function`
needed first) rather than touching `0071_tournaments.sql` itself.

## Frontend

### `src/lib/tournament-teams.ts` (new file)

Mirrors `src/lib/tournaments.ts`'s shape: types + thin RPC wrapper
functions for all 7 RPCs above, following the same defensive
`unknown -> union` row-mapping pattern used throughout `tournaments.ts`
and `teams.ts`.

### Public `/tournament/[id].tsx` (existing file, extended)

- Replace the current static `0 / {max_teams} teams registered` line with
  a live count derived from `list_tournament_team_registrations(id, false)`
  plus a simple list of the approved teams (logo + name), matching the
  visual density of the existing info block — no new component needed for
  a first pass, this can be inline JSX like the rest of the page.
- New section, shown only to a signed-in user who manages at least one team
  (via `listMyTeams()`, filtered client-side to `my_role in ('owner',
  'admin')` and `sport === tournament.sport`) **and** only while
  `tournament.status === 'registration_open'` for the "Register" action
  itself (the status-display part below still shows regardless of
  tournament status, so a team can see they're `approved` even after
  registration closes):
  - If the team manager has no eligible team: nothing rendered (not an
    error state — most viewers won't manage a matching team).
  - If they have one or more eligible teams with no existing registration:
    a picker (reuse the sport-chip / simple list pattern already used
    elsewhere, e.g. `tournament-form.tsx`'s sport chips) + "Register" button
    calling `register_team_for_tournament`.
  - If a status already exists for one of their teams
    (`get_my_team_registration_status`): show it
    (`tournamentTeams.statusPending` / `.statusApproved` /
    `.statusRejected` / `.statusWithdrawn` i18n keys) with a "Withdraw"
    button when `pending`/`approved`.

### New admin screen `/admin/tournaments/[id]/teams.tsx`

Follows `admin/users.tsx`'s shape (custom header, filter chips, list,
confirm dialogs via the existing `confirmAction` helper from the
discoverability work): status filter chips (`All`/`Pending`/`Approved`/
`Rejected`), each row shows team name/logo/sport, requested date,
Approve/Reject buttons (pending rows only), Remove button (approved rows
only), and a group-assignment `Pressable` chip row (approved rows only,
populated from `tournament.groups`, calling `admin_assign_team_group`).
Linked from `/admin/tournaments/[id]/edit.tsx` via a new row/button
("Manage teams" with a pending-count badge, e.g. "Manage teams (3
pending)") placed near the existing status-transition buttons.

## Out of scope for Phase 3

- Groups actually computing standings/points, match scheduling and entry
  (Phase 4).
- Playoff bracket, auto-advancement (Phase 5).
- Player-level rosters / check-in within a registered team (not yet
  decided which phase, if any, needs this — flagged as an open question
  for whoever scopes Phase 4/5, not assumed to exist).
- Any change to what "withdrawal" means once a tournament is
  `in_progress` — documented gap above, left for a later phase.
- Notifications (push/in-app) to a team when its registration is
  approved/rejected — the existing `admin_audit_log` records it, but
  nothing currently surfaces it proactively to the team; matches the
  precedent of Phase 1/2 also not building notifications for their own
  audited actions.

## Testing

SQL behavior test (`supabase/tests/tournament_teams_test.sql`), same style
as `supabase/tests/tournaments_test.sql` (identity-switching via
`set_config('request.jwt.claims', ...)`, `insert into _t values (...)` per
passing step): a non-manager can't register a team; a team manager can
register while `registration_open`; registering while not open fails with
`not_open`; wrong-sport registration fails with `wrong_sport`; duplicate
registration while pending/approved fails with `already_registered`;
admin approve/reject changes status correctly and is blocked for
non-admins; `tournament_full` is enforced both at registration and at
admin-approval time; `list_tournament_team_registrations`'s public view
excludes non-approved rows; `get_my_team_registration_status` returns the
right value across the lifecycle; the new `not_enough_teams` gate on
`registration_closed -> ready` fires correctly and clears once enough
teams are approved.
