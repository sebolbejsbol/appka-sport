# Phase 4: Groups, Standings, Match Entry — Design

Part of the "Advanced Tournament System" initiative. Phase 4 of 6:

1. ✅ Roles/permissions + admin user-management UI (done, merged, live)
2. ✅ Tournament data model + creation/config + lifecycle states (done, merged, live)
3. ✅ Team registration flow (done, merged, live)
4. **Groups, standings, match entry (this doc)**
5. Playoff bracket generation + auto-advancement
6. Public tournament page + responsive/mobile polish + audit log surfacing

Phase 4 turns a tournament's existing groups (created empty in Phase 2,
populated with approved teams in Phase 3) into an actual group stage: fixtures,
scores, and a computed standings table per group. No bracket/playoffs — that's
Phase 5.

## Context — reused conventions

Builds on Phase 1-3's conventions, unchanged:
- `SECURITY DEFINER` RPCs, `'ok' | <specific-failure-code>' text` returns,
  `is_app_admin()` gates every admin write, `admin_audit_log` on every mutation,
  plain numbered migration in `supabase/migrations/`, idempotent
  (`create table if not exists`, `drop policy if exists` before `create policy`).
- `revoke all ... from public; grant execute ... to authenticated;` on every new/changed function.
- i18n `t()` has no interpolation — explicit if/else per literal key, never a built key path.
- `tournaments` already has `points_win`, `points_draw`, `points_loss`, `allow_draws`
  (Phase 2) — Phase 4 is the first phase that actually *uses* them.
- `tournament_groups` (`id`, `tournament_id`, `name`, `sort_order`) — fixed at
  tournament creation (Phase 2), 1-16 groups, immutable set of names.
- `tournament_teams` (Phase 3) — `status` (`pending|approved|rejected|withdrawn`),
  `group_id` (nullable FK to `tournament_groups`, set via Phase 3's
  `admin_assign_team_group`). Only rows with `status = 'approved'` **and**
  a non-null `group_id` are eligible for fixtures — approved-but-unassigned
  teams are silently excluded from match generation (not blocking, not an error).
- `admin_set_tournament_status(p_tournament_id, p_new_status)` — Phase 3 added
  the `not_enough_teams` gate on `registration_closed -> ready`. Phase 4 hooks
  the same transition to auto-generate matches (see below) — same
  `create or replace`, same signature, no column-shape change.

## Decisions (confirmed with the user, 2026-08-12)

1. **Fixture generation: automatic round-robin**, triggered the moment a
   tournament transitions `registration_closed -> ready` (i.e. the instant
   the same not_enough_teams-gated transition from Phase 3 succeeds). Every
   unordered pair of approved+grouped teams *within the same group* gets
   exactly one match. No cross-group matches. Re-running the transition (not
   normally possible — `ready` isn't in `registration_closed`'s own legal-set
   so you can't re-enter it without going backwards first) is a non-issue,
   but the generator function itself is written idempotent (skips pairs that
   already have a match row) so it's safe if ever invoked twice.
2. **Standings tie-break chain: points → point difference → head-to-head.**
   Scope-limited (not asked explicitly, reasonable default): head-to-head is
   only applied to resolve an exact **2-team** tie (compare their single
   completed match's result). A 3-or-more-way tie after points+difference
   falls back to team name (stable, deterministic, not a real sports
   tie-break but avoids nondeterministic ordering) — documented here as a
   known simplification, not silently swallowed.
3. **Score entry: admin only**, via `is_app_admin()` — same gate as every
   other tournament write. No team-manager-reported-score path, no dispute
   flow (matches Phase 1-3's security model, avoids building conflict
   resolution nobody asked for).
4. **Scope: group stage only.** No playoff qualification marking, no
   "top N advance" logic — Phase 5's problem. A completed group stage just
   sits there with final standings; a human decides what happens next until
   Phase 5 exists.

## Data model — new table

```sql
create table public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  group_id uuid not null references public.tournament_groups (id) on delete cascade,
  team_a_id uuid not null references public.teams (id) on delete cascade,
  team_b_id uuid not null references public.teams (id) on delete cascade,

  score_a integer,
  score_b integer,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed')),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint tournament_matches_teams_distinct check (team_a_id <> team_b_id),
  constraint tournament_matches_unique_pair unique (group_id, team_a_id, team_b_id),
  constraint tournament_matches_scores_together check (
    (status = 'scheduled' and score_a is null and score_b is null)
    or (status = 'completed' and score_a is not null and score_b is not null)
  )
);
```

`team_a_id`/`team_b_id` ordering is arbitrary (whichever order the generator's
pairing loop produces) — display always resolves both names, no "home/away"
semantics needed for this sport type. Round-robin generation guarantees each
unordered pair appears once, so `unique (group_id, team_a_id, team_b_id)`
without a canonicalized ordering is sufficient *as long as the generator
itself never inserts both `(A,B)` and `(B,A)`* — the generator's pairing loop
(`for i in 1..n, for j in i+1..n`) enforces this by construction, so the
constraint is defense-in-depth, not the primary correctness mechanism.

## New RPCs

- `admin_generate_group_matches(p_tournament_id uuid) returns text` — internal
  helper, called from `admin_set_tournament_status` (not exposed as a
  standalone admin UI action in this phase). For each group, round-robins
  every approved+grouped team pair, `insert ... on conflict (group_id,
  team_a_id, team_b_id) do nothing` (idempotent). Also grant execute to
  authenticated in case a future phase needs to call it directly, but no
  frontend wrapper calls it directly in this phase.
- `admin_record_match_result(p_match_id uuid, p_score_a integer, p_score_b integer) returns text`
  — validates non-negative integer scores, rejects equal scores when the
  parent tournament's `allow_draws = false` (`'draws_not_allowed'`), sets
  `status = 'completed'`, `completed_at = now()`. Re-callable to correct an
  already-completed match's score (no separate "edit" RPC — same one,
  idempotent on the write, always re-derives standings live so a correction
  just works).
- `admin_reset_match(p_match_id uuid) returns text` — clears score, sets back
  to `'scheduled'` (undo a mis-entered result without deleting the fixture).
- `list_tournament_matches(p_tournament_id uuid) returns table (id, group_id, group_name, team_a_id, team_a_name, team_b_id, team_b_name, score_a, score_b, status, completed_at)`
  — authenticated read, all tournament statuses' matches visible (no
  draft-hiding needed — matches only exist once a tournament reached `ready`,
  which is already a public status).
- `get_tournament_standings(p_tournament_id uuid) returns table (group_id, group_name, team_id, team_name, played, wins, draws, losses, points_for, points_against, point_diff, points, rank)`
  — computed live from completed matches + the tournament's own
  `points_win/points_draw/points_loss`, ordered per the tie-break chain
  above, `rank` computed per-group via `row_number()` after the full sort
  (with the 2-team-h2h adjustment applied as a second pass, not expressible
  as a single `order by` — see implementation plan for the exact approach).

All five follow the existing `revoke all from public; grant execute to
authenticated` pattern.

## Frontend

- **Public tournament page** (`src/app/(app)/tournament/[id].tsx`): once
  `status` is `ready`, `in_progress`, or `completed`, add a "Standings" table
  per group (position, team, P/W/D/L, +/-/diff, Pts) and a "Results &
  fixtures" list per group (each match, score if completed, "vs" if
  scheduled). Read-only, same screen — this phase doesn't split it into tabs.
- **Admin match entry**: new screen `/admin/tournaments/[id]/matches.tsx`,
  linked from the edit screen next to Phase 3's "Manage teams" button (only
  enabled/visible once matches exist, i.e. `status` is `ready` or later).
  Grouped-by-group list of matches; each shows both team names, a score-entry
  form (two number inputs + "Save result"), and a "Reset" action once
  completed. Same list-screen shape as `admin/tournaments/[id]/teams.tsx`.

## Explicitly out of scope / deferred

- Playoff bracket, advancement, "top N per group" marking — Phase 5.
- Match scheduling (specific kick-off times, venues per match) — matches are
  just group-stage pairings, no per-match time/location in this phase.
- Team-manager-reported scores / dispute resolution.
- 3-or-more-way tie-break beyond points+difference (falls back to name sort,
  documented above).
- Editing/deleting individual fixtures (only score-entry and reset; the
  fixture *set* itself is fully determined by group membership at `ready`
  time and isn't hand-editable in this phase).
