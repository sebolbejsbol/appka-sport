# Phase 5: Playoff Bracket Generation + Auto-Advancement — Design

Part of the "Advanced Tournament System" initiative. Phase 5 of 6:

1. ✅ Roles/permissions + admin user-management UI (done, merged, live)
2. ✅ Tournament data model + creation/config + lifecycle states (done, merged, live)
3. ✅ Team registration flow (done, merged, live)
4. ✅ Groups, standings, match entry (done, merged, live)
5. **Playoff bracket generation + auto-advancement (this doc)**
6. Public tournament page + responsive/mobile polish + audit log surfacing

Phase 5 takes the top N teams out of each group's final standings (Phase 4)
and runs a single-elimination bracket to a champion, populated into the
already-existing (Phase 2) `tournaments.champion_team_id`.

## Decisions (confirmed with the user, 2026-08-12)

1. **Qualification: auto top-N per group.** Admin supplies one number `N`
   when generating the bracket; the system takes each group's top `N` teams
   by Phase 4 standings rank (fewer if a group has less than `N` teams — not
   an error, just fewer qualifiers from that group).
2. **Seeding: overall rank across all groups**, not cross-group pairing.
   Every qualified team gets a single combined seed number: sort by in-group
   `rank` first (all group-rank-1 teams first, then all group-rank-2 teams,
   etc.), tie-broken within the same in-group rank by `points` desc, then
   `point_diff` desc, then team name — i.e. the exact same ordering
   `get_tournament_standings` already produces, just read across groups
   instead of within one.
3. **Bracket trigger: explicit admin action** (`admin_generate_bracket`,
   called from a "Generate bracket" button), not automatic. Requires
   `status = 'in_progress'` and **every group-stage match already
   `'completed'`** (checked; `'group_stage_incomplete'` otherwise) — a
   bracket seeded from incomplete standings would be wrong. One-shot: if a
   bracket already exists for this tournament, returns `'bracket_exists'`
   (no regeneration/reseeding in this phase — see deferred list).
4. **Champion: `champion_team_id` is set automatically** the moment the
   final's result is recorded (detected as "no round exists after this
   match's round"). The tournament's own status (`in_progress ->
   completed`) stays a **manual** admin transition via the existing
   `admin_set_tournament_status`, unchanged — this phase does not touch
   that function.

## Bracket mechanics

**Seeding & byes:** with `n` qualified teams, `bracket_size` is the smallest
power of 2 `>= n`. Seed `i` (1-indexed, per the combined ranking above) is
paired against seed `bracket_size + 1 - i` in round 1, for `i` in `1 ..
bracket_size/2`. Any seed number `> n` doesn't exist — that pairing is a
**bye**: the real seed advances immediately (round-1 row created already
`status = 'completed'`, `winner_team_id` set, no match played). Because
`bracket_size` is by definition the *smallest* power of 2 `>= n`, byes only
ever occur in round 1 — every later round's team count is already an exact
power of 2, so rounds 2+ never need a bye. This is the simple "1-vs-last"
pairing, **not** the standard reseeded bracket that keeps the top 2 seeds in
opposite halves until the final** — documented explicitly as a scope
simplification below, since the correct recursive reseeding algorithm is
nontrivial to hand-write correctly in plpgsql and this app already
establishes precedent for scoping down tie-break/edge-case sophistication
(Phase 4's 3-way standings tie fallback) rather than under-testing something
elaborate.

**Rounds/slots:** all rounds for the tournament are created upfront at
generation time (round 1 populated/byes resolved immediately; rounds 2..N
created empty, `status = 'pending'`, both team slots `null`). `slot` is
1-indexed within each round; round `r+1`'s slot `ceil(slot/2)` is fed by
round `r`'s slots `2*slot-1` and `2*slot` (odd slot -> that match's `team_a`
of the target; even slot -> `team_b`). Round-1 byes cascade into round 2
immediately at generation time via the same rule.

**Auto-advancement:** `admin_record_playoff_result` sets the match's winner,
then applies the exact same slot-arithmetic update to fill the parent
round's corresponding slot — if that fill completes both of the parent's
team slots, its status flips `'pending' -> 'scheduled'`. If the completed
match has no next round at all (it was the final), `champion_team_id` is
set instead.

**No draws, ever, regardless of `allow_draws`:** a playoff match must
produce a winner. Equal scores are rejected (`'draws_not_allowed'`, same
code as Phase 4 for consistency) independent of the tournament's own
`allow_draws` setting — unlike the group stage, this isn't configurable.

## New table

```sql
create table public.tournament_playoff_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round integer not null check (round >= 1),
  slot integer not null check (slot >= 1),

  team_a_id uuid references public.teams (id) on delete set null,
  team_b_id uuid references public.teams (id) on delete set null,
  score_a integer,
  score_b integer,
  winner_team_id uuid references public.teams (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'completed')),

  created_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint tournament_playoff_matches_unique unique (tournament_id, round, slot)
);
```

`status` meaning: `'pending'` = at least one team slot still unknown
(waiting on a feeder match); `'scheduled'` = both teams known, not yet
played; `'completed'` = has a recorded winner (including byes, which are
`'completed'` immediately at generation with `team_b_id` left `null`).

## New RPCs

- `admin_generate_bracket(p_tournament_id uuid, p_teams_per_group integer) returns text`
  — admin-gated. Preconditions checked in order: tournament exists
  (`'not_found'`), `status = 'in_progress'` (`'invalid_status'`), no
  existing playoff rows for this tournament (`'bracket_exists'`), no
  incomplete (`status <> 'completed'`) group-stage match exists
  (`'group_stage_incomplete'`), `p_teams_per_group >= 1`
  (`'invalid_input'`), at least 2 teams end up qualified overall
  (`'not_enough_qualified_teams'`). Builds the full bracket per the
  mechanics above in one transaction. Audits once with
  `{teams_per_group, qualified_count, rounds}`.
- `admin_record_playoff_result(p_match_id uuid, p_score_a integer, p_score_b integer) returns text`
  — admin-gated. `'not_found'` if the match doesn't exist;
  `'not_scheduled'` if `status <> 'scheduled'` (blocks re-recording an
  already-completed match or a still-`'pending'` one — **no undo/reset in
  this phase**, see deferred list, so this guard is the only safety net
  against a double-cascade); `'invalid_input'` for null/negative scores;
  `'draws_not_allowed'` for equal scores (always, see above). On success:
  sets winner/status/completed_at, cascades into the parent slot or sets
  `champion_team_id`, audits `{score_a, score_b, winner_team_id}`.
- `list_tournament_playoff_bracket(p_tournament_id uuid) returns table (id uuid, round integer, slot integer, team_a_id uuid, team_a_name text, team_b_id uuid, team_b_name text, score_a integer, score_b integer, winner_team_id uuid, status text)`
  — authenticated read, left-joins team names (both slots nullable), order
  by round, slot. Round labels (Final/Semifinal/Quarterfinal/"Round N") are
  computed client-side from the fetched round count, not stored.

All three: `revoke all ... from public; grant execute ... to authenticated;`.
RLS mirrors `tournament_matches` (viewable when the tournament is
non-draft/non-cancelled, or by `is_app_admin()`; no direct-write policy,
RPC-only).

## Frontend

- **Admin**: new screen `/admin/tournaments/[id]/bracket.tsx`. If no
  bracket exists yet: a "Generate bracket" form (number input for teams per
  group + button, calling `admin_generate_bracket`) — only shown/enabled
  when `status = 'in_progress'`. Once a bracket exists: a round-by-round
  list (not a visual bracket-tree graphic — out of scope, see deferred),
  each match showing both team names (or "TBD" for a still-`'pending'`
  slot), a score-entry form for `'scheduled'` matches, and the final score
  for `'completed'` ones (no reset action — matches the no-undo decision
  above). Linked from the edit screen next to Phase 4's "Manage matches"
  button, visible once `status` is `in_progress` or `completed`.
- **Public tournament page**: once a bracket exists (fetch returns rows),
  render the same round-by-round list read-only, below the Phase 4
  standings/fixtures sections.

## Explicitly out of scope / deferred

- **True reseeded bracket** (top-2 seeds guaranteed opposite halves until
  the final) — the simpler 1-vs-last pairing is used instead; documented
  above as a known, deliberate simplification.
- **Bracket regeneration/reseeding** once generated, and **undo/reset** of
  a recorded playoff result — both would require walking forward through
  every already-cascaded advancement (and possibly `champion_team_id`) to
  unwind correctly; not attempted this phase. A mis-entered score today
  means the admin needs a support-level manual DB fix, same as any other
  mistake this app doesn't yet have an undo path for.
- **Visual bracket-tree rendering** — a round-by-round text list only,
  not an SVG/graphic bracket diagram.
- **Third-place playoff / consolation bracket.**
- Auto-transitioning tournament status to `'completed'` on champion
  determination — stays a manual admin click, per decision 4 above.
