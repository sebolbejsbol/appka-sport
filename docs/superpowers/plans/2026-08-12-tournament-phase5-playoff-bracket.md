# Phase 5: Playoff Bracket — Implementation Plan

Read `docs/superpowers/specs/2026-08-12-tournament-phase5-playoff-bracket-design.md`
in full before starting; this plan implements it.

**Tech Stack:** same as Phase 4. TypeScript baseline: 8 pre-existing tsc errors
(Mapbox/MapLibre type mismatches) — diff against this, not zero.

## Task 1: Migration 0075 — `tournament_playoff_matches` table + 3 RPCs

**Files:** Create `supabase/migrations/0075_tournament_playoff_matches.sql`

1. Table exactly as specified in the design doc.
2. RLS: enable, one select policy mirroring `tournament_matches`'s pattern
   (viewable when tournament non-draft/non-cancelled, or `is_app_admin()`).
   No insert/update/delete policy.
3. `admin_generate_bracket(p_tournament_id uuid, p_teams_per_group integer) returns text`:
   - Gate `is_app_admin()`.
   - Checks in order (see design doc for exact codes):
     tournament exists, `status = 'in_progress'`, no existing
     `tournament_playoff_matches` rows for this tournament, no
     `tournament_matches` row for this tournament with `status <>
     'completed'`, `p_teams_per_group >= 1`.
   - Build the combined seed list: for each group (ordered by
     `tournament_groups.sort_order`), take that group's top
     `p_teams_per_group` rows from the *same ranking logic*
     `get_tournament_standings` uses — simplest correct approach: call
     `get_tournament_standings(p_tournament_id)` from inside this function
     (it's already `stable`, callable from another function) and filter/sort
     in SQL rather than re-deriving the standings math a second time.
     Order the combined list by `rank` asc, then `points` desc, then
     `point_diff` desc, then `team_name` asc; take each group's first
     `p_teams_per_group` rows before the final combined ordering.
   - `'not_enough_qualified_teams'` if fewer than 2 result.
   - Compute `bracket_size` (smallest power of 2 `>=` qualified count) and
     `total_rounds` via simple `while` loops (both tiny, `<=` ~7 iterations
     for any realistic team count).
   - Round 1: loop `i` from `1` to `bracket_size/2`; `low_seed := i`,
     `high_seed := bracket_size + 1 - i`. `team_a` = seed array `[low_seed]`
     (always exists — see design doc's proof that `low_seed <=
     bracket_size/2 < n`). If `high_seed <= n`: insert a `'scheduled'` row
     with both teams. Else (bye): insert a `'completed'` row, `team_b_id
     null`, `winner_team_id` = the low seed's team, `completed_at = now()`.
   - Rounds `2..total_rounds`: loop and insert empty `'pending'` rows for
     every slot (`bracket_size / 2^round` slots in that round).
   - Cascade round-1 byes into round 2 in one `update ... from` (see design
     doc's SQL sketch), then a follow-up update flipping any round-2 row
     to `'scheduled'` where both team slots are now non-null and it was
     `'pending'`. Skip both statements harmlessly if `total_rounds = 1`
     (no round 2 exists — `update` affects 0 rows).
   - Audit log once: `{teams_per_group, qualified_count, rounds}`.
4. `admin_record_playoff_result(p_match_id uuid, p_score_a integer, p_score_b integer) returns text`:
   - Gate `is_app_admin()`. Look up the match; `'not_found'` if missing.
   - `'not_scheduled'` if `status <> 'scheduled'`.
   - `'invalid_input'` for null/negative scores.
   - `'draws_not_allowed'` if `p_score_a = p_score_b` (unconditional, no
     `allow_draws` check here — playoffs never allow draws).
   - Set `status='completed'`, `completed_at=now()`, scores,
     `winner_team_id` (higher scorer).
   - Cascade: `update tournament_playoff_matches set team_a_id/team_b_id
     (per slot-parity rule), status = case when both now non-null then
     'scheduled' else status end where tournament_id = <this match's
     tournament_id> and round = <this match's round> + 1 and slot =
     ceil(<this match's slot> / 2.0)`. If that update affects 0 rows (no
     next round), `update tournaments set champion_team_id = <winner>
     where id = <tournament_id>` instead.
   - Audit log `{score_a, score_b, winner_team_id}`.
5. `list_tournament_playoff_bracket(p_tournament_id uuid) returns table (...)`
   exactly per the design doc's column list, left-joining team names.

All three: `revoke all ... from public; grant execute ... to authenticated;`.
Migration ends `notify pgrst, 'reload schema';`.

Apply live via `node scripts/run-supabase-sql.mjs supabase/migrations/0075_tournament_playoff_matches.sql`.
**Remember Phase 4's lesson:** any bare column name matching a `returns
table (...)` OUT parameter (`round`, `slot`, `status`, `team_a_id`, etc.)
must be table-qualified everywhere inside the function body, even in
nested CTEs/subqueries, or Postgres throws `42702: ambiguous column`. Grep
the draft SQL for the OUT-param names before running it live.

## Task 2: SQL behavior test — `supabase/tests/tournament_playoff_test.sql`

Same style as `supabase/tests/tournament_matches_test.sql` (temp `_t` table,
`set_config` actor switching, fixture cleanup, `raise notice` summary).
Cover:
- A 5-qualified-team bracket (`bracket_size=8`, 3 byes, 1 real round-1
  match, 3 rounds total) — construct via 2+ groups so qualification pulls
  from multiple groups. Verify: exactly 3 round-1 rows are `'completed'`
  byes with `team_b_id null` and the correct `winner_team_id`; exactly 1
  round-1 row is `'scheduled'` with both teams; round-2 has 2 rows, both
  already `'scheduled'` (the two byes that cascaded into the same round-2
  slot) or one `'pending'` (waiting on the real round-1 match) as the seed
  math dictates — work out and assert the exact expected shape for your
  chosen fixture.
- `admin_generate_bracket` preconditions: reject when
  `status <> 'in_progress'`; reject when a group-stage match is still
  `'scheduled'`; reject a second call once a bracket exists
  (`'bracket_exists'`); reject `p_teams_per_group < 1`.
- `admin_record_playoff_result`: happy path cascades a winner into the
  parent round correctly (assert the parent's `team_a_id`/`team_b_id`
  matches); recording the final's result sets `tournaments.champion_team_id`
  and does **not** change `tournaments.status`; rejects equal scores
  (`'draws_not_allowed'`) **even when the fixture tournament has
  `allow_draws = true`** — this is the one behavior that must NOT follow
  the tournament's own setting, test it explicitly; rejects recording a
  `'pending'` (not yet `'scheduled'`) match; rejects re-recording an
  already-`'completed'` match (`'not_scheduled'`).
- Confirm fixture cleanup leaves zero leftover `tournament_playoff_matches`
  rows.

Run via `node scripts/run-supabase-sql.mjs supabase/tests/tournament_playoff_test.sql`,
iterate until every assertion passes live — expect this to surface at least
one bug on first run, same as every prior phase's Task 2.

## Task 3: `src/lib/tournament-playoffs.ts`

Mirror `src/lib/tournament-matches.ts`'s shape. Export `TournamentPlayoffMatch`
type, `AdminGenerateBracketResult`, `AdminRecordPlayoffResultResult` union
types, and `listTournamentPlayoffBracket`, `adminGenerateBracket`,
`adminRecordPlayoffResult` wrapper functions.

## Task 4: i18n — `tournamentPlayoffs` namespace (en + pl)

Bracket section title, round labels helper input ("Final"/"Semifinal"/
"Quarterfinal"/"Round {n}" — implement the label logic as a plain TS
function in Task 3 or Task 5's file using `t()` for each literal label, not
a dynamic key), "TBD" placeholder for an unknown slot, teams-per-group input
label, "Generate bracket" action, score entry labels (reuse
`tournamentMatches.scoreALabel`/`scoreBLabel` if identical, else add
namespaced ones), the `draws_not_allowed`/`not_scheduled`/
`group_stage_incomplete`/`bracket_exists`/`not_enough_qualified_teams`
error messages, empty state ("No bracket yet").

## Task 5: Admin bracket screen — `/admin/tournaments/[id]/bracket.tsx`

Same list-screen shape as Phase 4's matches screen. If
`listTournamentPlayoffBracket` returns empty: show the "Generate bracket"
form (number input, defaulting to something reasonable like 2, + button)
when the tournament's own `status === 'in_progress'`, else an empty-state
message. If non-empty: group rows by `round`, render each round's matches
(both team names or "TBD", score entry for `'scheduled'`, final score for
`'completed'`, nothing actionable for `'pending'`). No reset action per the
design doc.

## Task 6: Public tournament page — read-only bracket section

In `tournament/[id].tsx`, fetch `listTournamentPlayoffBracket` alongside
the existing Phase 4 fetches (extend the same `Promise.all`). If non-empty,
render the same round-by-round list, read-only, below the Phase 4
standings/fixtures sections.

## Task 7: Link from edit screen

`admin/tournaments/[id]/edit.tsx`: add a "Manage bracket" (or similarly
named per Task 4's chosen key) button next to Phase 4's "Manage matches"
button, visible when `status` is `in_progress` or `completed`.

## Task 8: Regenerate typed routes and end-to-end verification

Same procedure as Phase 4's Task 8. Expect exactly one transient error for
the new `bracket.tsx` route reference until the cache regenerates; baseline
after regen should be 8 (same as before this phase), zero new.

No commit for this task. Manual checklist for the user:
1. Complete a group stage (Phase 4) for a multi-group tournament, move
   status to `in_progress`, generate a bracket with a specific
   teams-per-group number — confirm the round-1 byes/matches match what
   you'd expect from the standings.
2. Play through every round's matches, confirm each result correctly
   advances the winner into the next round (both on the admin bracket
   screen and the public page).
3. Confirm the final's result sets a champion (check
   `tournaments.champion_team_id` or wherever it's surfaced) and does
   **not** flip the tournament to `completed` on its own.
4. Try an equal score in any playoff match — confirm `draws_not_allowed`
   even if the tournament itself has `allow_draws = true`.
5. Try generating a second bracket on the same tournament — confirm
   `bracket_exists` blocks it.
6. Confirm Phase 1-4 screens still work (admin users/tournaments/teams/
   matches, the Events screen tournament rail, public tournament page).
