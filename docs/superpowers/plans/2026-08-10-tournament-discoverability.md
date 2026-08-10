# Tournament Discoverability & Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins drop a map pin when creating/editing a tournament, and surface published tournaments (registration_open/closed, ready, in_progress, completed — never draft/cancelled) on the main "Eventy" screen's list and map views, as their own card/pin type, alongside (not merged into) regular events.

**Architecture:** Two independent additions on top of the already-shipped Phase 2 shell: (1) a location picker wired into the existing `TournamentForm`, reusing the existing `FieldReportLocationPicker` map widget generalized to accept custom copy; (2) a second, independent data fetch (`listTournaments`) on the Events screen, rendered through a new `TournamentCard` component and new map markers — no changes to the `events` table, `discover_events` RPC, or `EventCard`.

**Tech Stack:** Expo Router (React Native + react-native-web), Supabase (Postgres + RLS), TypeScript, `@rnmapbox/maps` (native) / `@/lib/map-kit-web` (web shim), i18n via `t()`. TypeScript verified with `npx tsc --noEmit`; SQL verified via `do $$ ... $$` assertions run manually in the SQL editor.

## Global Constraints

- Expo SDK 56 — check https://docs.expo.dev/versions/v56.0.0/ before using any Expo API not already used elsewhere in this codebase.
- Migrations are plain numbered `.sql` files in `supabase/migrations/`, applied via `node scripts/run-supabase-sql.mjs <path>` (every invocation prompts for permission — approve it live) or manually via Supabase Dashboard → SQL Editor. Every migration must be idempotent.
- Postgres cannot `create or replace function` when the return table's column list changes — the old function must be `drop function`-ed first, then recreated.
- i18n's `t()` has no interpolation (`t(key: TKey): string` only) — never build a dynamic key path from a variable.
- Any file with a `.tsx` and a `.web.tsx` sibling (Mapbox components) must be edited identically in both — the web file imports the same names from `@/lib/map-kit-web` instead of `@rnmapbox/maps`.
- Read `docs/superpowers/specs/2026-08-10-tournament-discoverability-design.md` in full before starting; this plan implements it.

---

## Task 1: Migration 0072 — `list_tournaments` returns latitude/longitude

**Files:**
- Create: `supabase/migrations/0072_tournaments_list_location.sql`

**Interfaces:**
- Produces (consumed by Task 2): `public.list_tournaments(p_status_filter text default null, p_admin_view boolean default false, p_limit integer default 50, p_offset integer default 0) returns table(id uuid, name text, logo_url text, sport text, event_date date, start_time time, end_time time, location_name text, city text, latitude double precision, longitude double precision, status text, max_teams integer, min_teams integer, created_at timestamptz, total_count bigint)` — note `latitude`/`longitude` are new columns inserted after `city`.

- [ ] **Step 1: Write the migration file**

```sql
-- Migracja 0072: list_tournaments zwraca też latitude/longitude
-- (potrzebne do wyświetlenia pinezki turnieju na mapie w ekranie Eventy).
-- Uruchom w Supabase: Dashboard -> SQL Editor -> New query -> wklej całość -> Run.
-- Idempotentna (bezpieczna do ponownego uruchomienia).

drop function if exists public.list_tournaments(text, boolean, integer, integer);

create function public.list_tournaments(
  p_status_filter text default null,
  p_admin_view boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, name text, logo_url text, sport text,
  event_date date, start_time time, end_time time,
  location_name text, city text,
  latitude double precision, longitude double precision,
  status text, max_teams integer, min_teams integer, created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if p_admin_view and not public.is_app_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    t.id, t.name, t.logo_url, t.sport,
    t.event_date, t.start_time, t.end_time,
    t.location_name, t.city,
    t.latitude, t.longitude,
    t.status, t.max_teams, t.min_teams, t.created_at,
    count(*) over() as total_count
  from public.tournaments t
  where
    (p_admin_view or t.status not in ('draft', 'cancelled'))
    and (p_status_filter is null or t.status = p_status_filter)
  order by t.event_date desc, t.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.list_tournaments(text, boolean, integer, integer) from public;
grant execute on function public.list_tournaments(text, boolean, integer, integer) to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run `node scripts/run-supabase-sql.mjs supabase/migrations/0072_tournaments_list_location.sql` (approve the permission prompt). Confirm no errors.

- [ ] **Step 3: Sanity-check in the SQL editor**

Run: `select latitude, longitude from public.list_tournaments(null, true, 5, 0);`
Expected: query succeeds (columns exist), no error, even if values are null for existing rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0072_tournaments_list_location.sql
git commit -m "Add latitude/longitude to list_tournaments return columns"
```

---

## Task 2: `src/lib/tournaments.ts` — thread latitude/longitude through the list type

**Files:**
- Modify: `src/lib/tournaments.ts`

**Interfaces:**
- Consumes: Task 1's updated `list_tournaments` columns.
- Produces: `TournamentListItem` gains `latitude: number | null` and `longitude: number | null` — consumed by Task 6 (map markers) and Task 5 (card, unused there but part of the type).

- [ ] **Step 1: Add the fields to `TournamentListItem`**

Find this block:

```ts
export type TournamentListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  sport: TournamentSport;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  city: string | null;
  status: TournamentStatus;
  max_teams: number;
  min_teams: number;
  created_at: string;
};
```

Replace with:

```ts
export type TournamentListItem = {
  id: string;
  name: string;
  logo_url: string | null;
  sport: TournamentSport;
  event_date: string;
  start_time: string;
  end_time: string | null;
  location_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  status: TournamentStatus;
  max_teams: number;
  min_teams: number;
  created_at: string;
};
```

- [ ] **Step 2: Map the new columns in `mapTournamentListRow`**

Find this block:

```ts
function mapTournamentListRow(raw: Record<string, unknown>): TournamentListItem {
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : null,
    sport: parseSport(raw.sport),
    event_date: String(raw.event_date ?? ''),
    start_time: String(raw.start_time ?? ''),
    end_time: typeof raw.end_time === 'string' ? raw.end_time : null,
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    status: parseStatus(raw.status),
    max_teams: Number(raw.max_teams) || 0,
    min_teams: Number(raw.min_teams) || 0,
    created_at: String(raw.created_at ?? ''),
  };
}
```

Replace with:

```ts
function mapTournamentListRow(raw: Record<string, unknown>): TournamentListItem {
  return {
    id: String(raw.id ?? ''),
    name: typeof raw.name === 'string' ? raw.name : '',
    logo_url: typeof raw.logo_url === 'string' ? raw.logo_url : null,
    sport: parseSport(raw.sport),
    event_date: String(raw.event_date ?? ''),
    start_time: String(raw.start_time ?? ''),
    end_time: typeof raw.end_time === 'string' ? raw.end_time : null,
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    city: typeof raw.city === 'string' ? raw.city : null,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : null,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : null,
    status: parseStatus(raw.status),
    max_teams: Number(raw.max_teams) || 0,
    min_teams: Number(raw.min_teams) || 0,
    created_at: String(raw.created_at ?? ''),
  };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (compare against the 15 known pre-existing map/CSS-import errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/tournaments.ts
git commit -m "Add latitude/longitude to TournamentListItem"
```

---

## Task 3: Generalize `FieldReportLocationPicker` copy so it can be reused outside field reports

**Files:**
- Modify: `src/components/field-report-map-picker.tsx`
- Modify: `src/components/field-report-map-picker.web.tsx`

**Interfaces:**
- Produces: `FieldReportLocationPicker` gains an optional `copy?: Partial<LocationPickerCopy>` prop; `LocationPickerCopy` type exported — consumed by Task 4 (tournament form passes tournament-specific copy). Existing callers (the field report screen) pass no `copy` and see zero behavior change — every string still defaults to today's `t('fieldReport.*')` keys.

- [ ] **Step 1: Add the `LocationPickerCopy` type and `copy` prop (both files)**

In **both** `field-report-map-picker.tsx` and `field-report-map-picker.web.tsx`, find:

```ts
export type FieldReportLocation = {
  lng: number;
  lat: number;
};

type Props = {
  value: FieldReportLocation | null;
  onChange: (location: FieldReportLocation) => void;
};
```

Replace with:

```ts
export type FieldReportLocation = {
  lng: number;
  lat: number;
};

export type LocationPickerCopy = {
  mapPickerTitle: string;
  mapPickerHint: string;
  cancelPicker: string;
  confirmLocation: string;
  locationSelected: string;
  changeLocation: string;
  openMapPicker: string;
  openMapPickerHint: string;
};

function resolveCopy(copy?: Partial<LocationPickerCopy>): LocationPickerCopy {
  return {
    mapPickerTitle: copy?.mapPickerTitle ?? t('fieldReport.mapPickerTitle'),
    mapPickerHint: copy?.mapPickerHint ?? t('fieldReport.mapPickerHint'),
    cancelPicker: copy?.cancelPicker ?? t('fieldReport.cancelPicker'),
    confirmLocation: copy?.confirmLocation ?? t('fieldReport.confirmLocation'),
    locationSelected: copy?.locationSelected ?? t('fieldReport.locationSelected'),
    changeLocation: copy?.changeLocation ?? t('fieldReport.changeLocation'),
    openMapPicker: copy?.openMapPicker ?? t('fieldReport.openMapPicker'),
    openMapPickerHint: copy?.openMapPickerHint ?? t('fieldReport.openMapPickerHint'),
  };
}

type Props = {
  value: FieldReportLocation | null;
  onChange: (location: FieldReportLocation) => void;
  copy?: Partial<LocationPickerCopy>;
};
```

- [ ] **Step 2: Thread resolved copy through the modal (both files)**

In **both** files, find:

```ts
type MapModalProps = {
  visible: boolean;
  initialCenter: LngLat;
  onConfirm: (location: FieldReportLocation) => void;
  onClose: () => void;
};

function FieldReportMapModal({ visible, initialCenter, onConfirm, onClose }: MapModalProps) {
```

Replace with:

```ts
type MapModalProps = {
  visible: boolean;
  initialCenter: LngLat;
  copy: LocationPickerCopy;
  onConfirm: (location: FieldReportLocation) => void;
  onClose: () => void;
};

function FieldReportMapModal({ visible, initialCenter, copy, onConfirm, onClose }: MapModalProps) {
```

Then, still inside `FieldReportMapModal`, replace every direct-copy reference with the `copy` param:

- `t('fieldReport.mapPickerTitle')` → `copy.mapPickerTitle`
- `t('fieldReport.mapPickerHint')` → `copy.mapPickerHint`
- `t('fieldReport.cancelPicker')` → `copy.cancelPicker` (appears twice in `field-report-map-picker.tsx`'s no-token fallback branch and the footer; only once in `.web.tsx`, which has no no-token fallback branch)
- `t('fieldReport.confirmLocation')` → `copy.confirmLocation`

(`field-report-map-picker.tsx`'s no-token fallback block still uses `t('map.missingToken')` — leave that one alone, it has no tournament-specific equivalent and isn't part of `LocationPickerCopy`.)

- [ ] **Step 3: Resolve and pass copy from `FieldReportLocationPicker` (both files)**

In **both** files, find:

```ts
export function FieldReportLocationPicker({ value, onChange }: Props) {
  const { coords } = useUserLocation();
  const [modalOpen, setModalOpen] = useState(false);

  const defaultCenter: LngLat = value
    ? [value.lng, value.lat]
    : coords ?? POLAND_CENTER;

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [styles.previewCard, pressed && styles.previewPressed]}>
        <View style={styles.previewIconWrap}>
          <Text style={styles.previewIcon}>📍</Text>
        </View>
        <View style={styles.previewMain}>
          {value ? (
            <>
              <Text style={styles.previewTitle}>{t('fieldReport.locationSelected')}</Text>
              <Text style={styles.previewCoords}>
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </Text>
              <Text style={styles.previewAction}>{t('fieldReport.changeLocation')} ›</Text>
            </>
          ) : (
            <>
              <Text style={styles.previewTitle}>{t('fieldReport.openMapPicker')}</Text>
              <Text style={styles.previewHint}>{t('fieldReport.openMapPickerHint')}</Text>
            </>
          )}
        </View>
      </Pressable>

      <FieldReportMapModal
        visible={modalOpen}
        initialCenter={defaultCenter}
        onConfirm={onChange}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
```

Replace with:

```ts
export function FieldReportLocationPicker({ value, onChange, copy: copyOverride }: Props) {
  const { coords } = useUserLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const copy = resolveCopy(copyOverride);

  const defaultCenter: LngLat = value
    ? [value.lng, value.lat]
    : coords ?? POLAND_CENTER;

  return (
    <>
      <Pressable
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [styles.previewCard, pressed && styles.previewPressed]}>
        <View style={styles.previewIconWrap}>
          <Text style={styles.previewIcon}>📍</Text>
        </View>
        <View style={styles.previewMain}>
          {value ? (
            <>
              <Text style={styles.previewTitle}>{copy.locationSelected}</Text>
              <Text style={styles.previewCoords}>
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
              </Text>
              <Text style={styles.previewAction}>{copy.changeLocation} ›</Text>
            </>
          ) : (
            <>
              <Text style={styles.previewTitle}>{copy.openMapPicker}</Text>
              <Text style={styles.previewHint}>{copy.openMapPickerHint}</Text>
            </>
          )}
        </View>
      </Pressable>

      <FieldReportMapModal
        visible={modalOpen}
        initialCenter={defaultCenter}
        copy={copy}
        onConfirm={onChange}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. The field-report screen (unchanged caller) must still compile and behave identically — it doesn't pass `copy`, so `resolveCopy(undefined)` falls back to the original `fieldReport.*` strings everywhere.

- [ ] **Step 5: Commit**

```bash
git add src/components/field-report-map-picker.tsx src/components/field-report-map-picker.web.tsx
git commit -m "Let FieldReportLocationPicker accept custom copy for reuse outside field reports"
```

---

## Task 4: Wire the location picker into `TournamentForm`

**Files:**
- Modify: `src/components/tournament-form.tsx`
- Modify: `src/lib/tournaments.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/pl.ts`

**Interfaces:**
- Consumes: `FieldReportLocationPicker`/`LocationPickerCopy` (Task 3), `Tournament.latitude`/`longitude` (already exist on the type, unchanged).
- Produces: `TournamentFormValue` gains `latitude: number | null` and `longitude: number | null`; `tournamentFormValueToInput` now passes real coordinates instead of hardcoded `null` — consumed by Task 1's already-existing `createTournament`/`updateTournament` RPC wrappers (no change needed there, they already forward `input.latitude`/`input.longitude`).

- [ ] **Step 1: Add i18n keys for the tournament location-picker copy**

In `src/i18n/en.ts`, inside the `tournamentForm: { ... }` block, add right after `city:`:

```ts
    locationPickTitle: 'Set tournament location',
    locationPickHint: 'Tap the map to place a pin at the venue.',
    locationSelected: 'Location set',
    locationChange: 'Change location',
    locationPick: 'Set location on map',
    locationPickHintShort: 'Optional — lets the tournament show up on the map.',
```

In `src/i18n/pl.ts`, inside the `tournamentForm: { ... }` block, add right after `city:`:

```ts
    locationPickTitle: 'Ustaw lokalizację turnieju',
    locationPickHint: 'Stuknij mapę, aby ustawić pinezkę w miejscu rozgrywek.',
    locationSelected: 'Lokalizacja ustawiona',
    locationChange: 'Zmień lokalizację',
    locationPick: 'Ustaw lokalizację na mapie',
    locationPickHintShort: 'Opcjonalne — dzięki temu turniej pojawi się na mapie.',
```

- [ ] **Step 2: Type-check the i18n additions**

Run: `npx tsc --noEmit`
Expected: no new errors (confirms both `en.ts` and `pl.ts` define the same key set, since `TKey` is derived from `en.ts` and `pl.ts` must satisfy it).

- [ ] **Step 3: Add latitude/longitude to `TournamentFormValue` and its helpers**

In `src/components/tournament-form.tsx`, find:

```ts
  locationName: string;
  address: string;
  city: string;
  contactInfo: string;
```

Replace with:

```ts
  locationName: string;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  contactInfo: string;
```

Find:

```ts
    locationName: '',
    address: '',
    city: '',
    contactInfo: '',
```

Replace with:

```ts
    locationName: '',
    address: '',
    city: '',
    latitude: null,
    longitude: null,
    contactInfo: '',
```

Find:

```ts
    locationName: tournament.location_name ?? '',
    address: tournament.address ?? '',
    city: tournament.city ?? '',
    contactInfo: tournament.contact_info ?? '',
```

Replace with:

```ts
    locationName: tournament.location_name ?? '',
    address: tournament.address ?? '',
    city: tournament.city ?? '',
    latitude: tournament.latitude,
    longitude: tournament.longitude,
    contactInfo: tournament.contact_info ?? '',
```

Find:

```ts
    locationName: v.locationName.trim() || null,
    address: v.address.trim() || null,
    city: v.city.trim() || null,
    latitude: null,
    longitude: null,
    contactInfo: v.contactInfo.trim() || null,
```

Replace with:

```ts
    locationName: v.locationName.trim() || null,
    address: v.address.trim() || null,
    city: v.city.trim() || null,
    latitude: v.latitude,
    longitude: v.longitude,
    contactInfo: v.contactInfo.trim() || null,
```

- [ ] **Step 4: Render the picker in the form**

In `src/components/tournament-form.tsx`, add the import:

```ts
import { FieldReportLocationPicker, type LocationPickerCopy } from '@/components/field-report-map-picker';
```

Right after the `import { TextField } from '@/components/text-field';` line (keep imports alphabetically grouped as the file already does).

Then, still in `tournament-form.tsx`, find:

```ts
      <TextField
        label={t('tournamentForm.locationName')}
        value={value.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        editable={!disabled}
      />
```

Replace with:

```ts
      <FieldReportLocationPicker
        value={
          value.latitude != null && value.longitude != null
            ? { lat: value.latitude, lng: value.longitude }
            : null
        }
        onChange={(loc) => onChange({ latitude: loc.lat, longitude: loc.lng })}
        copy={LOCATION_PICKER_COPY}
      />

      <TextField
        label={t('tournamentForm.locationName')}
        value={value.locationName}
        onChangeText={(locationName) => onChange({ locationName })}
        editable={!disabled}
      />
```

Then, above the `export function TournamentForm` line, add the copy constant:

```ts
const LOCATION_PICKER_COPY: LocationPickerCopy = {
  mapPickerTitle: t('tournamentForm.locationPickTitle'),
  mapPickerHint: t('tournamentForm.locationPickHint'),
  cancelPicker: t('common.cancel'),
  confirmLocation: t('tournamentForm.locationPick'),
  locationSelected: t('tournamentForm.locationSelected'),
  changeLocation: t('tournamentForm.locationChange'),
  openMapPicker: t('tournamentForm.locationPick'),
  openMapPickerHint: t('tournamentForm.locationPickHintShort'),
};
```

(Note: `disabled` on the surrounding form is not threaded into `FieldReportLocationPicker` — the underlying component has no `disabled`/read-only prop. This matches its only other current caller, which is always interactive. Acceptable for v1: a locked/completed tournament's edit screen already hides the whole form behind `tournamentForm.lockedNotice` before this component would render, per the existing `EditTournamentScreen` lock check.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament-form.tsx src/lib/tournaments.ts src/i18n/en.ts src/i18n/pl.ts
git commit -m "Add map location picker to the tournament create/edit form"
```

---

## Task 5: `TournamentCard` component

**Files:**
- Create: `src/components/tournament-card.tsx`

**Interfaces:**
- Consumes: `TournamentListItem` (Task 2), `formatTeamSport` (`@/lib/sports`), `parseLocalDateTime`/`formatEventDateTime` (`@/lib/datetime`), `tournamentStatus.*` i18n keys (already exist).
- Produces: `TournamentCard` component with props `{ tournament: TournamentListItem; onPress: (tournament: TournamentListItem) => void }` — consumed by Task 7 (Events screen).

- [ ] **Step 1: Write the component**

```tsx
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand, Radius } from '@/constants/theme';
import { shadow } from '@/constants/ui';
import { t } from '@/i18n';
import { formatEventDateTime, parseLocalDateTime } from '@/lib/datetime';
import { formatTeamSport } from '@/lib/sports';
import type { TournamentListItem, TournamentStatus } from '@/lib/tournaments';

type Props = {
  tournament: TournamentListItem;
  onPress: (tournament: TournamentListItem) => void;
};

const SPORT_EMOJI: Record<string, string> = {
  basketball: '🏀',
  football: '⚽',
  volleyball: '🏐',
  handball: '🤾',
};

function sportEmoji(sport: string): string {
  return SPORT_EMOJI[sport] ?? '🏆';
}

function statusLabel(status: TournamentStatus): string {
  switch (status) {
    case 'draft': return t('tournamentStatus.draft');
    case 'registration_open': return t('tournamentStatus.registrationOpen');
    case 'registration_closed': return t('tournamentStatus.registrationClosed');
    case 'ready': return t('tournamentStatus.ready');
    case 'in_progress': return t('tournamentStatus.inProgress');
    case 'completed': return t('tournamentStatus.completed');
    case 'cancelled': return t('tournamentStatus.cancelled');
  }
}

function formatWhen(tournament: TournamentListItem): string {
  const iso = parseLocalDateTime(tournament.event_date, tournament.start_time.slice(0, 5));
  return iso ? formatEventDateTime(iso) : tournament.event_date;
}

function TournamentCardComponent({ tournament, onPress }: Props) {
  const emoji = sportEmoji(tournament.sport);
  const place = [tournament.location_name, tournament.city].filter(Boolean).join(', ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => onPress(tournament)}>
      <View style={styles.media}>
        {tournament.logo_url ? (
          <Image source={{ uri: tournament.logo_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imageFallback}>
            <Text style={styles.fallbackEmoji}>{emoji}</Text>
          </View>
        )}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>{statusLabel(tournament.status)}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {tournament.name}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaIcon}>📅</Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {formatWhen(tournament)}
          </Text>
        </View>

        {place ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaIcon}>📍</Text>
            <Text style={styles.metaText} numberOfLines={1}>
              {place}
            </Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.sportChip}>
            <Text style={styles.sportChipText}>
              {emoji} {formatTeamSport(tournament.sport)}
            </Text>
          </View>
          <View style={styles.footerSpacer} />
          <Text style={styles.teams}>👥 0/{tournament.max_teams}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// Memo: analogiczne uzasadnienie co w EventCard — karty turniejów też żyją
// na przewijanych listach/rail'ach, które odświeżają się co fokus ekranu.
export const TournamentCard = memo(TournamentCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Brand.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Brand.border,
    overflow: 'hidden',
    ...shadow('sm'),
  },
  pressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  media: {
    position: 'relative',
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: Brand.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Brand.primaryLight,
  },
  fallbackEmoji: {
    fontSize: 52,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Brand.primary,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  body: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: Brand.textPrimary,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaIcon: {
    fontSize: 13,
  },
  metaText: {
    flex: 1,
    fontSize: 13,
    color: Brand.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  footerSpacer: {
    flex: 1,
  },
  sportChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  sportChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
  teams: {
    fontSize: 12,
    fontWeight: '700',
    color: Brand.textSecondary,
  },
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament-card.tsx
git commit -m "Add TournamentCard component for the public Events screen"
```

---

## Task 6: Tournament markers on `EventsMap`

**Files:**
- Modify: `src/components/events-map.tsx`
- Modify: `src/components/events-map.web.tsx`

**Interfaces:**
- Consumes: `TournamentListItem` (Task 2).
- Produces: `EventsMap` gains `tournaments: TournamentListItem[]` and `onSelectTournament: (tournament: TournamentListItem) => void` props — consumed by Task 7.

- [ ] **Step 1: Add the props and import `MarkerView` (both files)**

In `src/components/events-map.tsx`, find:

```ts
import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LocationPuck,
  MapView,
  ShapeSource,
  SymbolLayer,
} from '@rnmapbox/maps';
import { useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { categoryMeta, eventMarkerIcon, markerEmoji } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapEventIcons } from '@/lib/map-event-icons';
import type { LngLat } from '@/hooks/use-user-location';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

type Props = {
  events: DiscoverEvent[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
};
```

Replace with:

```ts
import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
} from '@rnmapbox/maps';
import { useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { categoryMeta, eventMarkerIcon, markerEmoji } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapEventIcons } from '@/lib/map-event-icons';
import type { TournamentListItem } from '@/lib/tournaments';
import type { LngLat } from '@/hooks/use-user-location';

const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
if (token) {
  Mapbox.setAccessToken(token);
}

type Props = {
  events: DiscoverEvent[];
  tournaments: TournamentListItem[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
  onSelectTournament: (tournament: TournamentListItem) => void;
};
```

In `src/components/events-map.web.tsx`, find:

```ts
import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LocationPuck,
  MapView,
  ShapeSource,
  SymbolLayer,
} from '@/lib/map-kit-web';
import { useMemo, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { categoryMeta, eventMarkerIcon, markerEmoji } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapEventIcons } from '@/lib/map-event-icons';
import type { LngLat } from '@/hooks/use-user-location';

type Props = {
  events: DiscoverEvent[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
};
```

Replace with:

```ts
import Mapbox, {
  Camera,
  CircleLayer,
  Images,
  LocationPuck,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
} from '@/lib/map-kit-web';
import { useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { categoryMeta, eventMarkerIcon, markerEmoji } from '@/lib/event-categories';
import type { DiscoverEvent } from '@/lib/discover-events';
import { POLAND_CENTER } from '@/lib/map-bbox';
import { mapEventIcons } from '@/lib/map-event-icons';
import type { TournamentListItem } from '@/lib/tournaments';
import type { LngLat } from '@/hooks/use-user-location';

type Props = {
  events: DiscoverEvent[];
  tournaments: TournamentListItem[];
  userCoords: LngLat | null;
  onSelectEvent: (event: DiscoverEvent) => void;
  onSelectTournament: (tournament: TournamentListItem) => void;
};
```

- [ ] **Step 2: Render tournament markers (both files)**

In **both** files, find:

```ts
export function EventsMap({ events, userCoords, onSelectEvent }: Props) {
```

Replace with:

```ts
export function EventsMap({ events, tournaments, userCoords, onSelectEvent, onSelectTournament }: Props) {
```

Then, in **both** files, find:

```ts
        {userCoords ? <LocationPuck pulsing="default" /> : null}
      </MapView>
```

Replace with:

```ts
        {tournaments
          .filter((tItem) => tItem.latitude != null && tItem.longitude != null)
          .map((tItem) => (
            <MarkerView
              key={tItem.id}
              coordinate={[tItem.longitude as number, tItem.latitude as number]}
              anchor={{ x: 0.5, y: 1 }}
              allowOverlap>
              <Pressable onPress={() => onSelectTournament(tItem)} hitSlop={8}>
                <Text style={styles.tournamentPin}>🏆</Text>
              </Pressable>
            </MarkerView>
          ))}

        {userCoords ? <LocationPuck pulsing="default" /> : null}
      </MapView>
```

- [ ] **Step 3: Add the pin style (both files)**

In **both** files, find:

```ts
const styles = StyleSheet.create({
  container: {
```

Replace with:

```ts
const styles = StyleSheet.create({
  tournamentPin: {
    fontSize: 30,
  },
  container: {
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/events-map.tsx src/components/events-map.web.tsx
git commit -m "Render tournament markers on the Events map"
```

---

## Task 7: Surface tournaments on the Events screen

**Files:**
- Modify: `src/app/(app)/events/index.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/pl.ts`

**Interfaces:**
- Consumes: `listTournaments` (`@/lib/tournaments`, already exists), `TournamentCard` (Task 5), `EventsMap`'s new props (Task 6).

- [ ] **Step 1: Add the i18n section title**

In `src/i18n/en.ts`, inside the `eventsList: { ... }` block, add (pick any line inside the block, order doesn't matter for `t()`):

```ts
    tournamentsRailTitle: 'Tournaments',
```

In `src/i18n/pl.ts`, inside the `eventsList: { ... }` block, add:

```ts
    tournamentsRailTitle: 'Turnieje',
```

- [ ] **Step 2: Type-check the i18n addition**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Fetch tournaments alongside events**

In `src/app/(app)/events/index.tsx`, find:

```ts
import { getActiveTeams, type ActiveTeam } from '@/lib/teams';
import { formatTeamSport } from '@/lib/sports';
import { t } from '@/i18n';
import {
  applyDiscoverFilters,
  countActiveDiscoverFilters,
  getDiscoverEvents,
  sortDiscoverEvents,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverEvent,
  type DiscoverFilters,
  type DiscoverSort,
} from '@/lib/discover-events';
import { logInteraction } from '@/lib/interactions';
```

Replace with:

```ts
import { getActiveTeams, type ActiveTeam } from '@/lib/teams';
import { formatTeamSport } from '@/lib/sports';
import { TournamentCard } from '@/components/tournament-card';
import { listTournaments, type TournamentListItem } from '@/lib/tournaments';
import { t } from '@/i18n';
import {
  applyDiscoverFilters,
  countActiveDiscoverFilters,
  getDiscoverEvents,
  sortDiscoverEvents,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverEvent,
  type DiscoverFilters,
  type DiscoverSort,
} from '@/lib/discover-events';
import { logInteraction } from '@/lib/interactions';
```

Find:

```ts
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [activeTeams, setActiveTeams] = useState<ActiveTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);

  const load = useCallback(async () => {
    const [{ data, error }, teams] = await Promise.all([
      getDiscoverEvents(),
      getActiveTeams(8),
    ]);
    setEvents(data);
    setActiveTeams(teams);
    setLoadError(!!error);
    setLoading(false);
  }, []);
```

Replace with:

```ts
  const [events, setEvents] = useState<DiscoverEvent[]>([]);
  const [tournaments, setTournaments] = useState<TournamentListItem[]>([]);
  const [activeTeams, setActiveTeams] = useState<ActiveTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filters, setFilters] = useState<DiscoverFilters>(DEFAULT_DISCOVER_FILTERS);

  const load = useCallback(async () => {
    const [{ data, error }, teams, tournamentsResult] = await Promise.all([
      getDiscoverEvents(),
      getActiveTeams(8),
      listTournaments(null, false),
    ]);
    setEvents(data);
    setActiveTeams(teams);
    setTournaments(
      [...tournamentsResult.data].sort((a, b) => a.event_date.localeCompare(b.event_date)),
    );
    setLoadError(!!error);
    setLoading(false);
  }, []);
```

- [ ] **Step 4: Add the `openTournament` handler**

Find:

```ts
  const openEvent = useCallback((event: DiscoverEvent) => {
    void logInteraction({
      kind: 'view_event',
      eventId: event.id,
      category: event.category,
      subcategory: event.subcategory,
    });
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  }, []);
```

Replace with:

```ts
  const openEvent = useCallback((event: DiscoverEvent) => {
    void logInteraction({
      kind: 'view_event',
      eventId: event.id,
      category: event.category,
      subcategory: event.subcategory,
    });
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  }, []);

  const openTournament = useCallback((tournament: TournamentListItem) => {
    router.push({ pathname: '/tournament/[id]', params: { id: tournament.id } });
  }, []);
```

- [ ] **Step 5: Pass tournaments into the map view**

Find:

```tsx
      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : view === 'map' ? (
        <EventsMap events={visibleEvents} userCoords={coords} onSelectEvent={openEvent} />
      ) : loadError && events.length === 0 ? (
```

Replace with:

```tsx
      {loading ? (
        <ActivityIndicator color={Brand.primary} style={styles.loader} />
      ) : view === 'map' ? (
        <EventsMap
          events={visibleEvents}
          tournaments={tournaments}
          userCoords={coords}
          onSelectEvent={openEvent}
          onSelectTournament={openTournament}
        />
      ) : loadError && events.length === 0 ? (
```

- [ ] **Step 6: Render the tournaments rail above the list**

Find:

```tsx
          ListHeaderComponent={
            showDiscoveryShelf ? (
              <PopularShelf
                events={popularEvents}
                teams={activeTeams}
                onOpenEvent={openEvent}
                onOpenTeam={openTeam}
              />
            ) : null
          }
```

Replace with:

```tsx
          ListHeaderComponent={
            <>
              {tournaments.length > 0 ? (
                <TournamentsRail tournaments={tournaments} onOpenTournament={openTournament} />
              ) : null}
              {showDiscoveryShelf ? (
                <PopularShelf
                  events={popularEvents}
                  teams={activeTeams}
                  onOpenEvent={openEvent}
                  onOpenTeam={openTeam}
                />
              ) : null}
            </>
          }
```

- [ ] **Step 7: Add the `TournamentsRail` component**

Find (the closing of `PopularShelf`, right before `function PopularCard`):

```tsx
function PopularCard({ event, onPress }: { event: DiscoverEvent; onPress: () => void }) {
```

Insert immediately before it:

```tsx
function TournamentsRail({
  tournaments,
  onOpenTournament,
}: {
  tournaments: TournamentListItem[];
  onOpenTournament: (tournament: TournamentListItem) => void;
}) {
  return (
    <View style={styles.shelf}>
      <Text style={styles.shelfTitle}>🏆 {t('eventsList.tournamentsRailTitle')}</Text>
      <View style={styles.tournamentRailList}>
        {tournaments.map((tItem) => (
          <View key={tItem.id} style={styles.tournamentRailItem}>
            <TournamentCard tournament={tItem} onPress={onOpenTournament} />
          </View>
        ))}
      </View>
    </View>
  );
}

function PopularCard({ event, onPress }: { event: DiscoverEvent; onPress: () => void }) {
```

- [ ] **Step 8: Add the rail's layout styles**

Find:

```ts
  shelf: {
    marginBottom: 18,
  },
```

Replace with:

```ts
  shelf: {
    marginBottom: 18,
  },
  tournamentRailList: {
    gap: 14,
  },
  tournamentRailItem: {
    width: '100%',
  },
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/events/index.tsx" src/i18n/en.ts src/i18n/pl.ts
git commit -m "Surface published tournaments on the Events screen (list and map)"
```

---

## Task 8: Regenerate typed routes and end-to-end verification

**Files:** none created — this task clears typed-routes false positives (none expected here, since no new route files were added) and walks the manual verification checklist.

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Full type-check against the Phase 2 baseline**

Run: `npx tsc --noEmit > after-discoverability.txt`
Compare against the Phase 2 baseline (15 known pre-existing, unrelated map/CSS-import errors). Expected: identical set, nothing new.

- [ ] **Step 2: Create a tournament with a location pin**

As an admin, open Admin → Tournaments → "+". Fill in the required fields, tap the new location card ("Set location on map" / "Ustaw lokalizację na mapie"), drop a pin inside the modal, confirm. Submit the form. Confirm it lands on the edit screen and the location card now shows "Location set" with coordinates.

- [ ] **Step 3: Confirm draft tournaments stay hidden**

With the tournament still in `draft`, open the main Events screen (list and map view) as any user. Confirm the tournament does **not** appear in either view.

- [ ] **Step 4: Publish and confirm discoverability**

Back in the admin edit screen, transition the tournament to `registration_open`. Reopen the Events screen: confirm a "🏆 Tournaments" rail appears above the events list showing the new `TournamentCard`, and switching to map view shows a 🏆 marker at the pin's location. Tap both the card and the marker — each should open `/tournament/[id]` for that tournament.

- [ ] **Step 5: Confirm the field-report picker still works unmodified**

Open the existing "Report a field" flow (wherever it's reachable in the app — check `field-report-map-picker.tsx`'s current usage if unsure) and confirm the map picker still shows the original field-report copy ("Pick a location", its existing hint text, etc.) with no visible change from before this plan.

No commit for this task — it's verification only. If any step fails, return to the relevant earlier task, fix, and re-run this checklist from the affected step onward.
