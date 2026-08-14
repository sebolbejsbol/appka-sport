import { supabase } from '@/lib/supabase';
import { enrichEventsWithFieldCoords } from '@/lib/event-field-coords';
import { isMissingEventFilterColumnsError } from '@/lib/event-errors';
import {
  parseEventType,
  parsePaymentStatus,
  parseSkillLevel,
  type EventType,
  type PaymentStatus,
  type SkillLevel,
} from '@/lib/event-filters';
import { parseEventFieldRating, type EventFieldRating } from '@/lib/field-ratings';
import { parseCategory, type EventCategory } from '@/lib/event-categories';

export type EventsListFilter = 'all' | 'mine' | 'spots';

/** Mecz zwrócony przez RPC events_for_field. */
export type EventVisibility = 'public' | 'friends_only';

export type BlockedCoPlayer = {
  user_id: string;
  nick: string | null;
};

export type EventWaitlistEntry = {
  user_id: string;
  nick: string | null;
  joined_at: string;
  is_blocked_by_me?: boolean;
};

export type EventSummary = {
  id: string;
  title: string | null;
  starts_at: string;
  duration_min: number;
  ends_at: string;
  is_past_scheduled_end: boolean;
  max_players: number | null;
  notes: string | null;
  status: 'planned' | 'cancelled' | 'finished';
  skill_level: SkillLevel;
  event_type: EventType;
  payment_status: PaymentStatus;
  visibility: EventVisibility;
  sport: string;
  creator_id: string;
  creator_nick: string | null;
  participant_count: number;
  waitlist_count: number;
  is_joined: boolean;
  is_waitlisted: boolean;
  has_blocked_co_player?: boolean;
};

export type EventListItem = EventSummary & {
  field_id: string;
  field_name: string | null;
  field_lng: number | null;
  field_lat: number | null;
  is_mine: boolean;
};

export type FilterableEventListItem = EventListItem;

export type EventParticipant = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  joined_at: string;
  checked_in_at: string | null;
  check_in_method: 'gps' | 'manual' | null;
  is_late: boolean | null;
  is_blocked_by_me?: boolean;
};

export type EventDetail = {
  id: string;
  field_id: string;
  field_name: string | null;
  field_lng: number | null;
  field_lat: number | null;
  category: EventCategory;
  subcategory: string | null;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  description_long: string | null;
  image_url: string | null;
  image_urls: string[];
  organizer_name: string | null;
  organizer_contact: string | null;
  organizer_url: string | null;
  price_cents: number | null;
  title: string | null;
  notes: string | null;
  starts_at: string;
  duration_min: number;
  ends_at: string;
  is_past_scheduled_end: boolean;
  max_players: number | null;
  status: 'planned' | 'cancelled' | 'finished';
  sport: string;
  skill_level: SkillLevel;
  event_type: EventType;
  payment_status: PaymentStatus;
  visibility: EventVisibility;
  creator_id: string;
  creator_nick: string | null;
  participant_count: number;
  waitlist_count: number;
  is_joined: boolean;
  is_waitlisted: boolean;
  can_manage: boolean;
  is_admin_view: boolean;
  check_in_opens_at: string;
  check_in_closes_at: string;
  check_in_window: 'not_yet' | 'open' | 'closed';
  my_check_in: {
    checked_in_at: string;
    method: 'gps' | 'manual';
    is_late: boolean;
  } | null;
  participants: EventParticipant[];
  waitlist: EventWaitlistEntry[];
  has_blocked_co_player: boolean;
  blocked_co_players: BlockedCoPlayer[];
  can_rate_field: boolean;
  my_field_rating: EventFieldRating | null;
};

export type NewEvent = {
  field_id: string;
  starts_at: string;
  duration_min: number;
  max_players: number | null;
  title: string | null;
  notes: string | null;
  skill_level: SkillLevel;
  event_type: EventType;
  payment_status: PaymentStatus;
  visibility: EventVisibility;
};

export type EventUpdate = {
  starts_at: string;
  duration_min: number;
  max_players: number | null;
  title: string | null;
  notes: string | null;
  skill_level: SkillLevel;
  event_type: EventType;
  payment_status: PaymentStatus;
  visibility: EventVisibility;
};

function parseVisibility(raw: unknown): EventVisibility {
  return raw === 'friends_only' ? 'friends_only' : 'public';
}

function mapEventSummaryRow(raw: Record<string, unknown>): EventSummary {
  return {
    id: String(raw.id ?? ''),
    title: typeof raw.title === 'string' ? raw.title : null,
    starts_at: String(raw.starts_at ?? ''),
    duration_min: Number(raw.duration_min) || 90,
    ends_at: String(raw.ends_at ?? raw.starts_at ?? ''),
    is_past_scheduled_end: Boolean(raw.is_past_scheduled_end),
    max_players: typeof raw.max_players === 'number' ? raw.max_players : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    status:
      raw.status === 'cancelled' || raw.status === 'finished' ? raw.status : 'planned',
    skill_level: parseSkillLevel(raw.skill_level),
    event_type: parseEventType(raw.event_type),
    payment_status: parsePaymentStatus(raw.payment_status),
    visibility: parseVisibility(raw.visibility),
    sport: typeof raw.sport === 'string' ? raw.sport : 'basketball',
    creator_id: String(raw.creator_id ?? ''),
    creator_nick: typeof raw.creator_nick === 'string' ? raw.creator_nick : null,
    participant_count: Number(raw.participant_count) || 0,
    waitlist_count: Number(raw.waitlist_count) || 0,
    is_joined: Boolean(raw.is_joined),
    is_waitlisted: Boolean(raw.is_waitlisted),
    has_blocked_co_player: Boolean(raw.has_blocked_co_player),
  };
}

function mapEventListItemRow(raw: Record<string, unknown>): EventListItem {
  const summary = mapEventSummaryRow(raw);
  return {
    ...summary,
    field_id: String(raw.field_id ?? ''),
    field_name: typeof raw.field_name === 'string' ? raw.field_name : null,
    field_lng: typeof raw.field_lng === 'number' ? raw.field_lng : null,
    field_lat: typeof raw.field_lat === 'number' ? raw.field_lat : null,
    is_mine: Boolean(raw.is_mine),
  };
}

function isUpcomingEventsRpcMissing(error: { code?: string; message?: string }): boolean {
  const msg = error.message ?? '';
  return (
    error.code === 'PGRST202' ||
    msg.includes('upcoming_events') ||
    msg.includes('Could not find the function')
  );
}

export async function getFilterableEvents(
  maxRows = 200,
): Promise<{ data: FilterableEventListItem[]; error: { message: string } | null }> {
  const [{ data, error }, fallback] = await Promise.all([
    supabase.rpc('upcoming_events', {
      p_filter: 'all',
      p_max_rows: maxRows,
    }),
    getFilterableEventsFallback(maxRows),
  ]);

  if (error && !isUpcomingEventsRpcMissing(error)) {
    return { data: [], error };
  }

  const rpcItems = error
    ? []
    : ((data as Record<string, unknown>[] | null) ?? []).map(mapEventListItemRow);

  const byId = new Map<string, FilterableEventListItem>();
  for (const item of rpcItems) byId.set(item.id, item);
  for (const item of fallback.data) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const merged = [...byId.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    data: await enrichEventsWithFieldCoords(merged),
    error: error && isUpcomingEventsRpcMissing(error) ? fallback.error : null,
  };
}

export async function getEventsForField(
  fieldId: string,
): Promise<{ data: EventSummary[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('events_for_field', { p_field_id: fieldId });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapEventSummaryRow),
    error: null,
  };
}

export async function getUpcomingEvents(
  filter: EventsListFilter = 'all',
  maxRows = 80,
): Promise<{ data: EventListItem[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('upcoming_events', {
    p_filter: filter,
    p_max_rows: maxRows,
  });

  if (!error) {
    const items = ((data as Record<string, unknown>[] | null) ?? []).map(mapEventListItemRow);
    if (items.length > 0) {
      return { data: items, error: null };
    }
    const fallback = await getUpcomingEventsFallback(filter, maxRows);
    if (fallback.data.length > 0) {
      return fallback;
    }
    return { data: items, error: null };
  }

  const msg = error.message ?? '';
  if (isUpcomingEventsRpcMissing(error)) {
    return getUpcomingEventsFallback(filter, maxRows);
  }

  return { data: [], error };
}

type UpcomingEventRow = {
  id: string;
  title: string | null;
  starts_at: string;
  duration_min: number;
  max_players: number | null;
  notes: string | null;
  status: string;
  sport?: string | null;
  skill_level?: string | null;
  event_type?: string | null;
  payment_status?: string | null;
  field_id: string;
  creator_id: string;
  fields: { name: string | null } | { name: string | null }[] | null;
  event_participants: { user_id: string }[];
};

async function getFilterableEventsFallback(
  maxRows: number,
): Promise<{ data: FilterableEventListItem[]; error: { message: string } | null }> {
  const result = await getUpcomingEventsFallback('all', maxRows);
  return result;
}

/** Gdy RPC upcoming_events zwraca pusto lub nie istnieje — ładuj bezpośrednio z tabeli. */
async function getUpcomingEventsFallback(
  filter: EventsListFilter,
  maxRows: number,
): Promise<{ data: EventListItem[]; error: { message: string } | null }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;

  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const withFilterColumns = `
      id,
      title,
      starts_at,
      duration_min,
      max_players,
      notes,
      status,
      sport,
      skill_level,
      event_type,
      payment_status,
      field_id,
      creator_id,
      fields!inner ( name, status ),
      event_participants ( user_id )
    `;

  const withoutFilterColumns = `
      id,
      title,
      starts_at,
      duration_min,
      max_players,
      notes,
      status,
      sport,
      field_id,
      creator_id,
      fields!inner ( name, status ),
      event_participants ( user_id )
    `;

  const first = await supabase
    .from('events')
    .select(withFilterColumns)
    .eq('status', 'planned')
    .eq('fields.status', 'approved')
    .gte('starts_at', cutoff)
    .order('starts_at', { ascending: true })
    .limit(maxRows);

  let rows: UpcomingEventRow[];

  if (first.error && isMissingEventFilterColumnsError(first.error)) {
    const second = await supabase
      .from('events')
      .select(withoutFilterColumns)
      .eq('status', 'planned')
      .eq('fields.status', 'approved')
      .gte('starts_at', cutoff)
      .order('starts_at', { ascending: true })
      .limit(maxRows);
    if (second.error) return { data: [], error: second.error };
    rows = (second.data as UpcomingEventRow[] | null) ?? [];
  } else if (first.error) {
    return { data: [], error: first.error };
  } else {
    rows = (first.data as UpcomingEventRow[] | null) ?? [];
  }
  const creatorIds = [...new Set(rows.map((r) => r.creator_id))];
  const nickById = new Map<string, string | null>();

  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, nick')
      .in('id', creatorIds);
    for (const profile of profiles ?? []) {
      nickById.set(profile.id, profile.nick);
    }
  }

  let items: EventListItem[] = rows.map((row) => {
    const field = Array.isArray(row.fields) ? row.fields[0] : row.fields;
    const participants = row.event_participants ?? [];
    const is_joined = userId ? participants.some((p) => p.user_id === userId) : false;
    const durationMin = row.duration_min || 90;
    const endsAt = new Date(new Date(row.starts_at).getTime() + durationMin * 60_000).toISOString();

    return {
      id: row.id,
      title: row.title,
      starts_at: row.starts_at,
      duration_min: durationMin,
      ends_at: endsAt,
      is_past_scheduled_end: Date.now() > new Date(endsAt).getTime(),
      max_players: row.max_players,
      notes: row.notes,
      status:
        row.status === 'cancelled' || row.status === 'finished' ? row.status : 'planned',
      skill_level: parseSkillLevel(row.skill_level),
      event_type: parseEventType(row.event_type),
      payment_status: parsePaymentStatus(row.payment_status),
      visibility: 'public',
      sport: typeof row.sport === 'string' ? row.sport : 'basketball',
      creator_id: row.creator_id,
      creator_nick: nickById.get(row.creator_id) ?? null,
      participant_count: participants.length,
      waitlist_count: 0,
      is_joined,
      is_waitlisted: false,
      field_id: row.field_id,
      field_name: field?.name ?? null,
      field_lng: null,
      field_lat: null,
      is_mine: userId === row.creator_id,
    };
  });

  if (filter === 'mine' && userId) {
    items = items.filter((e) => e.is_mine || e.is_joined);
  } else if (filter === 'spots') {
    items = items.filter(
      (e) => e.max_players == null || e.participant_count < e.max_players,
    );
  }

  return { data: items, error: null };
}

export async function getEventDetail(
  eventId: string,
): Promise<{ data: EventDetail | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('event_detail', { p_event_id: eventId });
  if (error) return { data: null, error };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  return { data: normalizeEventDetail(data as Record<string, unknown>), error: null };
}

function normalizeEventDetail(raw: Record<string, unknown>): EventDetail {
  const participants = Array.isArray(raw.participants)
    ? raw.participants.map((row) => {
        const p = row as Record<string, unknown>;
        return {
          user_id: String(p.user_id ?? ''),
          nick: typeof p.nick === 'string' ? p.nick : null,
          avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url : null,
          joined_at: String(p.joined_at ?? ''),
          checked_in_at:
            typeof p.checked_in_at === 'string' ? p.checked_in_at : null,
          check_in_method:
            p.check_in_method === 'gps' || p.check_in_method === 'manual'
              ? (p.check_in_method as 'gps' | 'manual')
              : null,
          is_late: typeof p.is_late === 'boolean' ? p.is_late : null,
          is_blocked_by_me: Boolean(p.is_blocked_by_me),
        };
      })
    : [];

  const myRaw = raw.my_check_in;
  const my_check_in =
    myRaw &&
    typeof myRaw === 'object' &&
    typeof (myRaw as Record<string, unknown>).checked_in_at === 'string'
      ? {
          checked_in_at: String((myRaw as Record<string, unknown>).checked_in_at),
          method: ((myRaw as Record<string, unknown>).method === 'manual'
            ? 'manual'
            : 'gps') as 'gps' | 'manual',
          is_late: Boolean((myRaw as Record<string, unknown>).is_late),
        }
      : null;

  const window = raw.check_in_window;
  const check_in_window =
    window === 'open' || window === 'closed' || window === 'not_yet'
      ? window
      : 'not_yet';

  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

  return {
    id: String(raw.id ?? ''),
    field_id: String(raw.field_id ?? ''),
    field_name: typeof raw.field_name === 'string' ? raw.field_name : null,
    field_lng: typeof raw.field_lng === 'number' ? raw.field_lng : null,
    field_lat: typeof raw.field_lat === 'number' ? raw.field_lat : null,
    category: parseCategory(raw.category),
    subcategory: strOrNull(raw.subcategory),
    lat: numOrNull(raw.lat),
    lng: numOrNull(raw.lng),
    location_name: strOrNull(raw.location_name),
    description_long: strOrNull(raw.description_long),
    image_url: strOrNull(raw.image_url),
    image_urls: Array.isArray(raw.image_urls)
      ? (raw.image_urls.filter((u) => typeof u === 'string') as string[])
      : [],
    organizer_name: strOrNull(raw.organizer_name),
    organizer_contact: strOrNull(raw.organizer_contact),
    organizer_url: strOrNull(raw.organizer_url),
    price_cents: numOrNull(raw.price_cents),
    title: typeof raw.title === 'string' ? raw.title : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    starts_at: String(raw.starts_at ?? ''),
    duration_min: Number(raw.duration_min) || 90,
    ends_at: String(raw.ends_at ?? ''),
    is_past_scheduled_end: Boolean(raw.is_past_scheduled_end),
    max_players:
      typeof raw.max_players === 'number' ? raw.max_players : null,
    status:
      raw.status === 'cancelled' || raw.status === 'finished'
        ? raw.status
        : 'planned',
    sport: typeof raw.sport === 'string' ? raw.sport : 'basketball',
    skill_level: parseSkillLevel(raw.skill_level),
    event_type: parseEventType(raw.event_type),
    payment_status: parsePaymentStatus(raw.payment_status),
    visibility: parseVisibility(raw.visibility),
    creator_id: String(raw.creator_id ?? ''),
    creator_nick: typeof raw.creator_nick === 'string' ? raw.creator_nick : null,
    participant_count: Number(raw.participant_count) || participants.length,
    waitlist_count: Number(raw.waitlist_count) || 0,
    is_joined: Boolean(raw.is_joined),
    is_waitlisted: Boolean(raw.is_waitlisted),
    can_manage: Boolean(raw.can_manage),
    is_admin_view: Boolean(raw.is_admin_view),
    check_in_opens_at: String(raw.check_in_opens_at ?? ''),
    check_in_closes_at: String(raw.check_in_closes_at ?? ''),
    check_in_window,
    my_check_in,
    participants,
    waitlist: Array.isArray(raw.waitlist)
      ? raw.waitlist.map((row) => {
          const w = row as Record<string, unknown>;
          return {
            user_id: String(w.user_id ?? ''),
            nick: typeof w.nick === 'string' ? w.nick : null,
            joined_at: String(w.joined_at ?? ''),
            is_blocked_by_me: Boolean(w.is_blocked_by_me),
          };
        })
      : [],
    has_blocked_co_player: Boolean(raw.has_blocked_co_player),
    blocked_co_players: Array.isArray(raw.blocked_co_players)
      ? raw.blocked_co_players.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            user_id: String(item.user_id ?? ''),
            nick: typeof item.nick === 'string' ? item.nick : null,
          };
        })
      : [],
    can_rate_field: Boolean(raw.can_rate_field),
    my_field_rating: parseEventFieldRating(raw.my_field_rating),
  };
}

export async function createEvent(
  creatorId: string,
  event: NewEvent,
): Promise<{ data: { id: string } | null; error: { message: string; code?: string } | null }> {
  const basePayload = {
    field_id: event.field_id,
    creator_id: creatorId,
    sport: 'basketball',
    starts_at: event.starts_at,
    duration_min: event.duration_min,
    max_players: event.max_players,
    title: event.title,
    notes: event.notes,
  };

  const withFilters = {
    ...basePayload,
    skill_level: event.skill_level,
    event_type: event.event_type,
    payment_status: event.payment_status,
    visibility: event.visibility,
  };

  let result = await supabase.from('events').insert(withFilters).select('id').single<{ id: string }>();

  if (result.error && isMissingEventFilterColumnsError(result.error)) {
    result = await supabase.from('events').insert(basePayload).select('id').single<{ id: string }>();
  }

  return { data: result.data, error: result.error };
}

export async function updateEvent(
  eventId: string,
  patch: EventUpdate,
): Promise<{ error: { message: string; code?: string } | null }> {
  const basePatch = {
    starts_at: patch.starts_at,
    duration_min: patch.duration_min,
    max_players: patch.max_players,
    title: patch.title,
    notes: patch.notes,
  };

  const withFilters = {
    ...basePatch,
    skill_level: patch.skill_level,
    event_type: patch.event_type,
    payment_status: patch.payment_status,
    visibility: patch.visibility,
  };

  let result = await supabase.from('events').update(withFilters).eq('id', eventId);

  if (result.error && isMissingEventFilterColumnsError(result.error)) {
    result = await supabase.from('events').update(basePatch).eq('id', eventId);
  }

  return { error: result.error };
}

export async function deleteEvent(
  eventId: string,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  return { error };
}

export type LifecycleResult =
  | 'finished'
  | 'extended'
  | 'not_organizer'
  | 'already_closed'
  | 'event_not_found'
  | 'not_authenticated'
  | 'invalid_duration'
  | 'too_long'
  | 'error';

export async function finishEvent(eventId: string): Promise<LifecycleResult> {
  const { data, error } = await supabase.rpc('finish_event', { p_event_id: eventId });
  if (error) return 'error';
  return (data as LifecycleResult | null) ?? 'error';
}

export async function extendEvent(
  eventId: string,
  extraMinutes: number,
): Promise<LifecycleResult> {
  const { data, error } = await supabase.rpc('extend_event', {
    p_event_id: eventId,
    p_extra_minutes: extraMinutes,
  });
  if (error) return 'error';
  return (data as LifecycleResult | null) ?? 'error';
}

export type JoinResult =
  | 'joined'
  | 'already_joined'
  | 'waitlisted'
  | 'already_waitlisted'
  | 'full'
  | 'closed'
  | 'not_found'
  | 'not_authenticated'
  | 'friends_only'
  | 'forbidden'
  | 'error';

export async function joinEvent(eventId: string): Promise<JoinResult> {
  const { data, error } = await supabase.rpc('join_event', { p_event_id: eventId });
  if (error) return 'error';
  return (data as JoinResult | null) ?? 'error';
}

export type LeaveResult =
  | 'left'
  | 'left_waitlist'
  | 'not_participant'
  | 'not_waitlisted'
  | 'organizer_cannot_leave'
  | 'not_found'
  | 'not_authenticated'
  | 'error';

export async function leaveEvent(eventId: string): Promise<LeaveResult> {
  const { data, error } = await supabase.rpc('leave_event', { p_event_id: eventId });
  if (error) return 'error';
  return (data as LeaveResult | null) ?? 'error';
}

export async function leaveEventWaitlist(eventId: string): Promise<LeaveResult> {
  const { data, error } = await supabase.rpc('leave_event_waitlist', { p_event_id: eventId });
  if (error) return 'error';
  return (data as LeaveResult | null) ?? 'error';
}

export type RemoveParticipantResult =
  | 'removed'
  | 'not_participant'
  | 'cannot_remove_organizer'
  | 'forbidden'
  | 'not_found'
  | 'not_authenticated'
  | 'error';

export async function removeEventParticipant(
  eventId: string,
  userId: string,
): Promise<RemoveParticipantResult> {
  const { data, error } = await supabase.rpc('remove_event_participant', {
    p_event_id: eventId,
    p_user_id: userId,
  });
  if (error) return 'error';
  return (data as RemoveParticipantResult | null) ?? 'error';
}

// --- Indywidualne zaproszenia na event (z listy „Szukaj teraz") ---

export type InviteUserResult =
  | 'sent'
  | 'already_invited'
  | 'already_member'
  | 'forbidden'
  | 'invalid_user'
  | 'closed'
  | 'not_found'
  | 'not_authenticated'
  | 'error';

export async function inviteUserToEvent(
  eventId: string,
  userId: string,
): Promise<InviteUserResult> {
  const { data, error } = await supabase.rpc('invite_user_to_event', {
    p_event_id: eventId,
    p_user_id: userId,
  });
  if (error) return 'error';
  return (data as InviteUserResult | null) ?? 'error';
}

export type InvitableEvent = {
  event_id: string;
  title: string | null;
  sport: string | null;
  subcategory: string | null;
  starts_at: string;
  location_name: string | null;
  participant_count: number;
  max_players: number | null;
};

export async function getInvitableEvents(userId: string): Promise<InvitableEvent[]> {
  const { data, error } = await supabase.rpc('my_invitable_events', { p_user_id: userId });
  if (error) return [];
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    event_id: String(r.event_id ?? ''),
    title: typeof r.title === 'string' ? r.title : null,
    sport: typeof r.sport === 'string' ? r.sport : null,
    subcategory: typeof r.subcategory === 'string' ? r.subcategory : null,
    starts_at: String(r.starts_at ?? ''),
    location_name: typeof r.location_name === 'string' ? r.location_name : null,
    participant_count: Number(r.participant_count) || 0,
    max_players: typeof r.max_players === 'number' ? r.max_players : null,
  }));
}

/** Poszukiwacz z trybu „Szukaj teraz", którego preferencje pasują do eventu. */
export type EventInviteSeeker = {
  user_id: string;
  nick: string | null;
  avatar_url: string | null;
  category: string;
  sport: string | null;
  skill: string | null;
  note: string | null;
  distance_m: number | null;
  is_online: boolean;
};

/** Lista poszukiwaczy „Szukaj teraz" pasujących do eventu (tylko dla organizatora). */
export async function listEventInviteSeekers(
  eventId: string,
  limit = 50,
): Promise<{ data: EventInviteSeeker[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('list_event_invite_seekers', {
    p_event_id: eventId,
    p_limit: limit,
  });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      user_id: String(r.user_id ?? ''),
      nick: typeof r.nick === 'string' ? r.nick : null,
      avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
      category: typeof r.category === 'string' ? r.category : 'sport',
      sport: typeof r.sport === 'string' ? r.sport : null,
      skill: typeof r.skill === 'string' ? r.skill : null,
      note: typeof r.note === 'string' ? r.note : null,
      distance_m: typeof r.distance_m === 'number' ? r.distance_m : null,
      is_online: Boolean(r.is_online),
    })),
    error: null,
  };
}

export type EventInvitation = {
  invitation_id: string;
  event_id: string;
  event_title: string | null;
  sport: string | null;
  subcategory: string | null;
  from_user_id: string;
  from_nick: string | null;
  from_avatar_url: string | null;
  starts_at: string;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  participant_count: number;
  max_players: number | null;
  created_at: string;
};

export async function listMyEventInvitations(): Promise<{
  data: EventInvitation[];
  error: { message: string } | null;
}> {
  const { data, error } = await supabase.rpc('list_my_event_invitations');
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
      invitation_id: String(r.invitation_id ?? ''),
      event_id: String(r.event_id ?? ''),
      event_title: typeof r.event_title === 'string' ? r.event_title : null,
      sport: typeof r.sport === 'string' ? r.sport : null,
      subcategory: typeof r.subcategory === 'string' ? r.subcategory : null,
      from_user_id: String(r.from_user_id ?? ''),
      from_nick: typeof r.from_nick === 'string' ? r.from_nick : null,
      from_avatar_url: typeof r.from_avatar_url === 'string' ? r.from_avatar_url : null,
      starts_at: String(r.starts_at ?? ''),
      location_name: typeof r.location_name === 'string' ? r.location_name : null,
      lat: typeof r.lat === 'number' ? r.lat : null,
      lng: typeof r.lng === 'number' ? r.lng : null,
      participant_count: Number(r.participant_count) || 0,
      max_players: typeof r.max_players === 'number' ? r.max_players : null,
      created_at: String(r.created_at ?? ''),
    })),
    error: null,
  };
}

export type RespondInvitationResult =
  | 'joined'
  | 'waitlisted'
  | 'declined'
  | 'event_closed'
  | 'closed'
  | 'not_found'
  | 'not_authenticated'
  | 'error';

export async function respondEventInvitation(
  invitationId: string,
  accept: boolean,
): Promise<RespondInvitationResult> {
  const { data, error } = await supabase.rpc('respond_event_user_invitation', {
    p_invitation_id: invitationId,
    p_accept: accept,
  });
  if (error) return 'error';
  return (data as RespondInvitationResult | null) ?? 'error';
}
