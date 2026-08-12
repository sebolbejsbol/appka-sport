# Phase 4: Groups, Standings, Match Entry — Implementation Plan

Read `docs/superpowers/specs/2026-08-12-tournament-phase4-groups-standings-design.md`
in full before starting; this plan implements it.

**Tech Stack:** Expo Router (React Native + react-native-web), Supabase (Postgres + RLS),
TypeScript, i18n via `t()`. SQL behavior verified with `do $$ ... $$` assertion scripts
under `supabase/tests/`, run via `node scripts/run-supabase-sql.mjs`. TypeScript
verified with `npx tsc --noEmit` (baseline: 8 pre-existing errors as of 2026-08-12,
unrelated Mapbox/MapLibre type mismatches — diff against this, not zero).

## Task 1: Migration 0074 — `tournament_matches` table + 5 RPCs + `admin_set_tournament_status` hook

**Files:** Create `supabase/migrations/0074_tournament_matches.sql`

Contents (see design doc for full context):
1. `tournament_matches` table exactly as specified in the design doc's Data
   model section (all constraints included).
2. RLS: enable, one select policy mirroring `tournament_teams`'s pattern —
   viewable by authenticated users when the parent tournament is
   non-draft/non-cancelled, or by `is_app_admin()`. No insert/update/delete
   policy (RPC-only writes).
3. `admin_generate_group_matches(p_tournament_id uuid) returns text`:
   gate `is_app_admin()`. For each group of the tournament, select approved
   teams with `group_id` set to that group; for every unordered pair
   (nested loop `i < j` over an array/cursor ordered by team_id to guarantee
   no `(A,B)`+`(B,A)` duplicate), `insert into tournament_matches (...)
   values (...) on conflict (group_id, team_a_id, team_b_id) do nothing`.
   Log one `admin_audit_log` row per tournament call (not per match) with
   metadata `{matches_created: <count>}`. Return `'ok'`.
4. `admin_record_match_result(p_match_id uuid, p_score_a integer, p_score_b integer) returns text`:
   gate `is_app_admin()`. Look up the match's tournament to check
   `allow_draws`; if `p_score_a = p_score_b` and `allow_draws = false`,
   return `'draws_not_allowed'`. Reject negative or null scores
   (`'invalid_input'`). Update `status='completed'`, `completed_at=now()`,
   the two scores. Audit log `record_match_result` with
   `{score_a, score_b}`. Return `'ok'`. Not found -> `'not_found'`.
5. `admin_reset_match(p_match_id uuid) returns text`: gate `is_app_admin()`.
   Set `score_a=null, score_b=null, status='scheduled', completed_at=null`.
   Audit log `reset_match`. Return `'ok'`. Not found -> `'not_found'`.
6. `list_tournament_matches(p_tournament_id uuid) returns table (id uuid, group_id uuid, group_name text, team_a_id uuid, team_a_name text, team_b_id uuid, team_b_name text, score_a integer, score_b integer, status text, completed_at timestamptz)`:
   authenticated read, join `teams` twice (aliased) for both names, join
   `tournament_groups` for group name, order by group `sort_order` then
   `created_at`.
7. `get_tournament_standings(p_tournament_id uuid) returns table (group_id uuid, group_name text, team_id uuid, team_name text, played integer, wins integer, draws integer, losses integer, points_for integer, points_against integer, point_diff integer, points integer, rank integer)`:
   implement per the design doc's tie-break scope (points desc, point_diff
   desc, 2-team-only head-to-head, else team_name asc). **Must include every
   approved+grouped team even with 0 played matches** (left join from
   `tournament_teams`, not from `tournament_matches`). Wrap any head-to-head
   subquery result in `coalesce(..., 0)` — a tie pair that hasn't played yet
   (both 0-played) must not let a `null` head-to-head score sort ahead of
   real results elsewhere in the same group.
8. `admin_set_tournament_status`: `create or replace`, same signature. After
   the existing Phase 3 `not_enough_teams` gate passes and the status update
   commits (or immediately before returning `'ok'` for this specific
   transition), call `admin_generate_group_matches(p_tournament_id)`
   internally (direct SQL, not through the RPC's own admin-gate re-check —
   it's already inside an admin-gated function) when `v_status =
   'registration_closed' and p_new_status = 'ready'`.

All 5 new/changed functions: `revoke all ... from public; grant execute ...
to authenticated;`. Migration ends `notify pgrst, 'reload schema';`.

Apply live via `node scripts/run-supabase-sql.mjs supabase/migrations/0074_tournament_matches.sql`
(hits a permission prompt — expected, approve it).

## Task 2: SQL behavior test — `supabase/tests/tournament_matches_test.sql`

Cover, against real fixture tournaments/teams/tournament_teams rows (create
and clean up within the test, same style as
`supabase/tests/tournament_teams_test.sql`):
- Round-robin generation produces exactly `n*(n-1)/2` matches for an
  n-team group; re-running `admin_generate_group_matches` doesn't duplicate.
- A team approved but with `group_id is null` gets no matches.
- `admin_record_match_result` happy path updates status/scores; rejects a
  draw when the tournament's `allow_draws = false`; rejects negative scores.
- `admin_reset_match` clears a completed match back to scheduled.
- `get_tournament_standings`: a team with 0 played matches appears with all
  zeros (not missing). Verify points math against a known
  `points_win/draw/loss` fixture. Verify a constructed 2-team exact tie
  (same points, same point_diff) resolves via their head-to-head result in
  the expected direction. Verify a 3-way tie (construct one deliberately)
  falls back to name order without erroring or returning null ranks.
- `admin_set_tournament_status`'s `registration_closed -> ready` transition
  actually creates matches as a side effect (query `tournament_matches`
  count before/after the transition call in the test).
- Confirm fixture cleanup leaves zero leftover rows (delete tournament
  cascades to matches via FK `on delete cascade` — verify the cascade
  actually fires, don't just trust the constraint).

Run via `node scripts/run-supabase-sql.mjs supabase/tests/tournament_matches_test.sql`,
iterate until every assertion passes live.

## Task 3: `src/lib/tournament-matches.ts` — types and RPC wrappers

Mirror `src/lib/tournament-teams.ts`'s shape exactly (same error-handling
pattern, same `supabase.rpc(...)` call style). Export types
`TournamentMatch`, `TournamentStanding`, and wrapper functions
`listTournamentMatches`, `getTournamentStandings`,
`adminRecordMatchResult`, `adminResetMatch`. (No wrapper for
`admin_generate_group_matches` — not called from the frontend per the
design doc.)

## Task 4: i18n — match/standings namespaces (en + pl)

New keys under a `tournamentMatches` namespace (or extend
`tournamentTeams` if that reads more naturally alongside existing code —
implementer's judgment, follow whichever existing namespace-per-screen
convention `en.ts`/`pl.ts` already uses elsewhere in the tournament
sections): group headers, standings table column headers (P/W/D/L, +/-,
Pts), "vs", score input labels, "Save result", "Reset", empty states
("No matches yet" / "Standings appear once matches are completed"), and
the `draws_not_allowed` error message.

## Task 5: Public tournament page — standings + fixtures

In `src/app/(app)/tournament/[id].tsx`: when `status` is `ready`,
`in_progress`, or `completed`, fetch `listTournamentMatches` +
`getTournamentStandings` alongside the existing detail fetch (parallel,
same `Promise.all` pattern as the events screen). Render one collapsible
(or simply stacked, implementer's call matching existing screen density)
section per group: a standings table (rank, team, P/W/D/L, diff, Pts) above
that group's fixtures/results list (both team names, score if completed,
"vs" separator if scheduled). Follow this screen's existing loading/error
patterns (don't introduce a new one — reuse whatever Task 6/7 of Phase 3
already established here for `loadError`).

## Task 6: Admin match-entry screen — `/admin/tournaments/[id]/matches.tsx`

Same list-screen shape as `admin/tournaments/[id]/teams.tsx`. Group-by-group
list of matches. Each row: both team names, and either a two-number-input
score-entry form + "Save result" button (scheduled matches) or the final
score + a "Reset" button (completed matches). Call
`adminRecordMatchResult`/`adminResetMatch`, refetch the list after each
action (or optimistically update — implementer's call, match Task 7 of
Phase 3's established pattern in `teams.tsx` for consistency). Surface
`draws_not_allowed` as a specific inline error, not the generic failure
message.

## Task 7: Link from edit screen

In `src/app/(app)/admin/tournaments/[id]/edit.tsx`, add a "Manage matches"
button next to Phase 3's "Manage teams" button, visible/enabled once
`status` is `ready` or later (matches only exist from that point on).

## Task 8: Regenerate typed routes and end-to-end verification

Same procedure as Phase 3's Task 9: `npx tsc --noEmit` baseline before,
`CI=1 npx expo start --web --port <N>`, hit the root once, kill, `npx tsc
--noEmit` again, diff — expect zero new errors beyond the existing 8.

No commit for this task. Manual checklist (hand to the user, don't drive
their browser):
1. On a tournament with teams approved+grouped in Phase 3, close
   registration and transition to `ready` — confirm matches appear
   (`admin/tournaments/[id]/matches`), correct count per group.
2. Enter a few results, confirm standings update correctly (points, diff,
   rank) on both the admin screen (if shown there) and the public page.
3. Construct a 2-team tie deliberately (same points+diff) and confirm
   head-to-head ordering matches the actual match result between just
   those two.
4. Try entering a draw on a tournament with `allow_draws = false` — confirm
   the specific rejection message, not a generic error.
5. Reset a completed match, confirm it drops out of standings math (played
   count decreases) and reappears as "scheduled".
6. Confirm Phase 1-3 screens still work: `/admin/users`, `/admin/tournaments`,
   the Phase 3 teams screen, the Events screen tournament rail.
