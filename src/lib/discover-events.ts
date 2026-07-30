import { supabase } from '@/lib/supabase';
import {
  categoryLabel,
  parseCategory,
  subcategoryLabel,
  type CategoryFilter,
  type EventCategory,
} from '@/lib/event-categories';
import {
  matchesDateFilter,
  type DateFilter,
  type EventType,
  type PaymentStatus,
  type SkillLevel,
} from '@/lib/event-filters';
import { distanceMeters, type LngLat } from '@/lib/geo';

/** Wydarzenie w zakładce Eventy / na mapie eventów (wspólny model). */
export type DiscoverEvent = {
  id: string;
  title: string | null;
  category: EventCategory;
  subcategory: string | null;
  sport: string | null;
  skill_level: SkillLevel;
  event_type: EventType;
  is_instant: boolean;
  starts_at: string;
  duration_min: number;
  ends_at: string;
  lat: number | null;
  lng: number | null;
  location_name: string | null;
  notes: string | null;
  description_long: string | null;
  image_url: string | null;
  image_urls: string[];
  organizer_name: string | null;
  organizer_contact: string | null;
  organizer_url: string | null;
  payment_status: PaymentStatus;
  price_cents: number | null;
  max_players: number | null;
  field_id: string | null;
  creator_id: string;
  creator_nick: string | null;
  participant_count: number;
  is_joined: boolean;
  is_mine: boolean;
};

export type DiscoverSort = 'date' | 'distance' | 'popularity';

/** Typ treści: wszystkie wydarzenia lub tylko aktywności „Szukam teraz". */
export type ContentType = 'all' | 'instant';

export type DiscoverFilters = {
  category: CategoryFilter;
  subcategory: string | null;
  contentType: ContentType;
  skill: SkillLevel | 'all';
  eventType: EventType | 'all';
  payment: 'all' | 'free' | 'paid';
  date: DateFilter;
  distanceKm: number | null;
  onlyFreeSpots: boolean;
  search: string;
  sort: DiscoverSort;
};

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilters = {
  category: 'all',
  subcategory: null,
  contentType: 'all',
  skill: 'all',
  eventType: 'all',
  payment: 'all',
  date: 'all',
  distanceKm: null,
  onlyFreeSpots: false,
  search: '',
  sort: 'date',
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseSkill(value: unknown): SkillLevel {
  return value === 'beginner' || value === 'intermediate' || value === 'advanced'
    ? value
    : 'any';
}

function parseType(value: unknown): EventType {
  return value === 'training' ||
    value === 'tournament' ||
    value === 'sparring' ||
    value === 'looking_for_players'
    ? value
    : 'match';
}

function mapRow(raw: Record<string, unknown>): DiscoverEvent {
  return {
    id: String(raw.id ?? ''),
    title: typeof raw.title === 'string' ? raw.title : null,
    category: parseCategory(raw.category),
    subcategory: typeof raw.subcategory === 'string' ? raw.subcategory : null,
    sport: typeof raw.sport === 'string' ? raw.sport : null,
    skill_level: parseSkill(raw.skill_level),
    event_type: parseType(raw.event_type),
    is_instant: Boolean(raw.is_instant),
    starts_at: String(raw.starts_at ?? ''),
    duration_min: Number(raw.duration_min) || 90,
    ends_at: String(raw.ends_at ?? raw.starts_at ?? ''),
    lat: num(raw.lat),
    lng: num(raw.lng),
    location_name: typeof raw.location_name === 'string' ? raw.location_name : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    description_long: typeof raw.description_long === 'string' ? raw.description_long : null,
    image_url: typeof raw.image_url === 'string' ? raw.image_url : null,
    image_urls: Array.isArray(raw.image_urls)
      ? (raw.image_urls.filter((u) => typeof u === 'string') as string[])
      : [],
    organizer_name: typeof raw.organizer_name === 'string' ? raw.organizer_name : null,
    organizer_contact: typeof raw.organizer_contact === 'string' ? raw.organizer_contact : null,
    organizer_url: typeof raw.organizer_url === 'string' ? raw.organizer_url : null,
    payment_status: raw.payment_status === 'paid' ? 'paid' : 'free',
    price_cents: num(raw.price_cents),
    max_players: num(raw.max_players),
    field_id: typeof raw.field_id === 'string' ? raw.field_id : null,
    creator_id: String(raw.creator_id ?? ''),
    creator_nick: typeof raw.creator_nick === 'string' ? raw.creator_nick : null,
    participant_count: Number(raw.participant_count) || 0,
    is_joined: Boolean(raw.is_joined),
    is_mine: Boolean(raw.is_mine),
  };
}

export async function getDiscoverEvents(
  maxRows = 500,
): Promise<{ data: DiscoverEvent[]; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc('discover_events', { p_max_rows: maxRows });
  if (error) return { data: [], error };
  return {
    data: ((data as Record<string, unknown>[] | null) ?? []).map(mapRow),
    error: null,
  };
}

export function eventHasFreeSpots(event: DiscoverEvent): boolean {
  if (event.max_players == null) return true;
  return event.participant_count < event.max_players;
}

function matchesSearch(event: DiscoverEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    event.title,
    categoryLabel(event.category),
    subcategoryLabel(event.subcategory),
    event.location_name,
    event.organizer_name,
    event.creator_nick,
    event.notes,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function applyDiscoverFilters(
  events: DiscoverEvent[],
  filters: DiscoverFilters,
  ctx: { userCoords: LngLat | null; now?: Date },
): DiscoverEvent[] {
  const now = ctx.now ?? new Date();
  return events.filter((event) => {
    if (filters.contentType === 'instant' && !event.is_instant) return false;
    if (filters.category !== 'all' && event.category !== filters.category) return false;
    if (filters.subcategory && event.subcategory !== filters.subcategory) return false;
    if (
      filters.skill !== 'all' &&
      event.skill_level !== 'any' &&
      event.skill_level !== filters.skill
    )
      return false;
    if (filters.eventType !== 'all' && event.event_type !== filters.eventType) return false;
    if (filters.payment !== 'all' && event.payment_status !== filters.payment) return false;
    if (!matchesDateFilter(event.starts_at, filters.date, now)) return false;
    if (
      filters.distanceKm != null &&
      ctx.userCoords &&
      event.lng != null &&
      event.lat != null &&
      distanceMeters(ctx.userCoords, [event.lng, event.lat]) > filters.distanceKm * 1000
    )
      return false;
    if (filters.onlyFreeSpots && !eventHasFreeSpots(event)) return false;
    if (!matchesSearch(event, filters.search)) return false;
    return true;
  });
}

export function sortDiscoverEvents(
  events: DiscoverEvent[],
  sort: DiscoverSort,
  userCoords: LngLat | null,
): DiscoverEvent[] {
  const copy = [...events];
  if (sort === 'popularity') {
    copy.sort((a, b) => b.participant_count - a.participant_count || a.starts_at.localeCompare(b.starts_at));
    return copy;
  }
  if (sort === 'distance' && userCoords) {
    const dist = (e: DiscoverEvent) =>
      e.lng != null && e.lat != null
        ? distanceMeters(userCoords, [e.lng, e.lat])
        : Number.POSITIVE_INFINITY;
    copy.sort((a, b) => dist(a) - dist(b) || a.starts_at.localeCompare(b.starts_at));
    return copy;
  }
  copy.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return copy;
}

export function countActiveDiscoverFilters(filters: DiscoverFilters): number {
  let n = 0;
  if (filters.category !== 'all') n += 1;
  if (filters.subcategory) n += 1;
  if (filters.contentType !== 'all') n += 1;
  if (filters.skill !== 'all') n += 1;
  if (filters.eventType !== 'all') n += 1;
  if (filters.payment !== 'all') n += 1;
  if (filters.date !== 'all') n += 1;
  if (filters.distanceKm != null) n += 1;
  if (filters.onlyFreeSpots) n += 1;
  if (filters.search.trim()) n += 1;
  return n;
}

export type NewDiscoverEvent = {
  title: string;
  category: EventCategory;
  subcategory: string | null;
  starts_at: string;
  duration_min: number;
  lat: number;
  lng: number;
  field_id?: string | null;
  location_name: string | null;
  notes: string | null;
  description_long: string | null;
  image_url: string | null;
  image_urls: string[];
  organizer_name: string | null;
  organizer_contact: string | null;
  organizer_url: string | null;
  max_players: number | null;
  payment_status: PaymentStatus;
  price_cents: number | null;
  skill_level: SkillLevel;
  is_instant: boolean;
};

/** Tworzy wydarzenie rozszerzone (bez boiska, z własną pinezką). */
export async function createDiscoverEvent(
  creatorId: string,
  event: NewDiscoverEvent,
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const payload = {
    creator_id: creatorId,
    field_id: event.field_id ?? null,
    sport: event.category === 'sport' ? event.subcategory : null,
    category: event.category,
    subcategory: event.subcategory,
    title: event.title,
    starts_at: event.starts_at,
    duration_min: event.duration_min,
    max_players: event.max_players,
    lat: event.lat,
    lng: event.lng,
    location_name: event.location_name,
    notes: event.notes,
    description_long: event.description_long,
    image_url: event.image_url,
    image_urls: event.image_urls.length > 0 ? event.image_urls : null,
    organizer_name: event.organizer_name,
    organizer_contact: event.organizer_contact,
    organizer_url: event.organizer_url,
    payment_status: event.payment_status,
    price_cents: event.payment_status === 'paid' ? event.price_cents : null,
    skill_level: event.skill_level,
    is_instant: event.is_instant,
  };

  const result = await supabase
    .from('events')
    .insert(payload)
    .select('id')
    .single<{ id: string }>();

  return { data: result.data, error: result.error };
}
