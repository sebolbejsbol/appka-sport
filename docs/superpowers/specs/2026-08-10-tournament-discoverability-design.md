# Tournament discoverability & location — design spec

**Status:** approved. Folded into Phase 2 (tournament data model, creation, lifecycle) before merge to `main`.

## Problem

Phase 2 shipped the tournament data model, lifecycle, and admin CRUD screens
(`docs/superpowers/specs/2026-08-09-tournament-phase2-data-model-design.md`),
but two things were missing once a real admin tried to use it:

1. **No way to place a tournament on a map.** `tournamentFormValueToInput`
   (`src/components/tournament-form.tsx`) always sends
   `latitude: null, longitude: null` — the create/edit form has text fields
   for venue name/address/city but no coordinate picker.
2. **No discovery surface for regular users.** A published (non-draft,
   non-cancelled) tournament is only reachable via the admin panel or a
   direct link to `/tournament/[id]`. It never appears on the main "Eventy"
   screen (`src/app/(app)/events/index.tsx`) that regular users actually
   browse — so nobody finds out a tournament exists unless an admin shares
   the link by hand.

## Out of scope (unchanged, deferred to later phases)

- Team/player registration ("joining" a tournament) — Phase 3.
- Group standings and match entry — Phase 4.
- Playoff bracket — Phase 5.
- Any richer public tournament page content (matches, standings) — Phase 6.

This spec does **not** touch the `events` table, `discover_events` RPC, or
`EventCard`. Tournaments stay a separate entity; this only makes them
*visible* alongside events and gives them a real location.

## 1. Location picker

Reuse `field-report-map-picker.tsx` / `.web.tsx` (`src/components/`), an
existing tap-to-drop-a-pin Mapbox component already used for field reports.
Its interface is generic (`value: {lat, lng} | null`, `onChange`), so it
needs no modification — just import it into `TournamentForm`
(`src/components/tournament-form.tsx`), placed in the "Basic information"
section near venue name/address/city.

- `TournamentFormValue` gains `latitude: number | null` and
  `longitude: number | null` (currently absent from the type entirely).
- `tournamentToFormValue` reads them from `Tournament.latitude/longitude`.
- `tournamentFormValueToInput` passes them through instead of hardcoding
  `null`.
- No validation change needed — coordinates are optional, exactly like
  today (a tournament with no pin dropped just won't show a map marker in
  §2 below, same as it does for e.g. `field-report-map-picker`'s own
  optional use elsewhere).

## 2. Discovery: tournaments on the Events screen

`src/app/(app)/events/index.tsx` adds a second, independent data fetch
alongside the existing `getDiscoverEvents()` call:

```ts
const [{ data: events, error }, teams, { data: tournaments }] = await Promise.all([
  getDiscoverEvents(),
  getActiveTeams(8),
  listTournaments(null, false), // already exists from Phase 2
]);
```

`listTournaments(null, false)` already excludes `draft`/`cancelled` server-side
(the `p_admin_view=false` branch's `where` clause). Sort the returned list by
soonest `event_date` ascending client-side (the RPC's own ordering is
`event_date desc` for the admin list — the public screen sorts independently,
no RPC change).

**List view:** new `TournamentCard` component (`src/components/tournament-card.tsx`),
sibling to `EventCard`, not a variant of it — the data shapes don't overlap
(no player slots, no waitlist). Shows: logo/sport icon, name, formatted event
date, city/venue, and team count so far vs. `max_teams` (team count for now
reads `0/{max_teams}` — Phase 3 will make it live once registration exists).
Tapping navigates to `/tournament/[id]`.

**Map view:** tournaments with non-null `latitude`/`longitude` render as
additional markers on the same `EventsMap` Mapbox surface, using a distinct
marker (🏆 emoji, matching the existing emoji-marker convention in
`event-categories.ts`'s `markerEmoji`) so they're visually distinct from
event pins at a glance. Tournaments with no coordinates (skipped the picker)
simply don't get a map marker — they still appear in list view.

**Filter/sort UI:** no new filter chips for v1 — tournaments always show
(when any exist) as their own section/rail above or below the events list,
labelled with `t('adminTournaments.title')` equivalent for the public
surface (reuse existing `tournamentStatus.*` strings for any status badge
shown on the card, e.g. "Registration open").

## Data flow summary

```
TournamentForm (create/edit)
  -> field-report-map-picker sets latitude/longitude on TournamentFormValue
  -> tournamentFormValueToInput -> createTournament/updateTournament (existing RPCs, unchanged)

Events screen (list/map)
  -> listTournaments(null, false) (existing RPC, unchanged)
  -> TournamentCard (list) / 🏆 marker (map)
  -> tap -> /tournament/[id] (existing public page, unchanged)
```

## Testing

- Type-check (`npx tsc --noEmit`) after each file change, diffed against the
  Phase 2 baseline (15 known pre-existing unrelated errors).
- Manual: create a tournament, drop a location pin, publish it
  (`registration_open`), confirm it appears in both the Events list and map
  view; confirm a `draft` tournament does not appear; confirm tapping the
  card/pin opens the correct `/tournament/[id]`.
