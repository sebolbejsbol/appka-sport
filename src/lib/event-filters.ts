import { distanceMeters, type LngLat } from '@/lib/geo';

import { DEFAULT_SPORT_FILTER, type SportFilter } from '@/lib/sports';

export type SkillLevel = 'any' | 'beginner' | 'intermediate' | 'advanced';
export type EventType =
  | 'match'
  | 'training'
  | 'tournament'
  | 'sparring'
  | 'looking_for_players';
export type PaymentFilter = 'all' | 'free' | 'paid';
export type PaymentStatus = 'free' | 'paid';
export type DateFilter = 'all' | 'today' | 'tomorrow' | 'week';
export type DistanceFilterKm = number | null;

export type EventFilters = {
  sport: SportFilter;
  skillLevel: SkillLevel | 'all';
  eventType: EventType | 'all';
  payment: PaymentFilter;
  date: DateFilter;
  distanceKm: DistanceFilterKm;
  onlyFreeSpots: boolean;
};

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  sport: DEFAULT_SPORT_FILTER,
  skillLevel: 'all',
  eventType: 'all',
  payment: 'all',
  date: 'all',
  distanceKm: null,
  onlyFreeSpots: false,
};

export type FilterableEvent = {
  id: string;
  starts_at: string;
  max_players: number | null;
  participant_count: number;
  skill_level: SkillLevel;
  event_type: EventType;
  payment_status: PaymentStatus;
  sport: string;
  field_id: string;
  field_lng: number | null;
  field_lat: number | null;
};

export type FilterContext = {
  userCoords: LngLat | null;
  now?: Date;
};

function startOfLocalDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function matchesDateFilter(startsAtIso: string, dateFilter: DateFilter, now: Date): boolean {
  if (dateFilter === 'all') return true;

  const startsAt = new Date(startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return false;

  const startKey = localDateKey(startsAt);
  const todayKey = localDateKey(now);

  if (dateFilter === 'today') {
    return startKey === todayKey;
  }

  if (dateFilter === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return startKey === localDateKey(tomorrow);
  }

  const weekEnd = new Date(startOfLocalDay(now));
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);
  return startsAt >= startOfLocalDay(now) && startsAt <= weekEnd;
}

export function matchesDistanceFilter(
  event: FilterableEvent,
  distanceKm: DistanceFilterKm,
  userCoords: LngLat | null,
): boolean {
  if (distanceKm == null) return true;
  if (!userCoords || event.field_lng == null || event.field_lat == null) return true;

  const meters = distanceMeters(userCoords, [event.field_lng, event.field_lat]);
  return meters <= distanceKm * 1000;
}

export function hasFreeSpots(event: FilterableEvent): boolean {
  if (event.max_players == null) return true;
  return event.participant_count < event.max_players;
}

export function freeSpotsCount(
  event: Pick<FilterableEvent, 'max_players' | 'participant_count'>,
): number | null {
  if (event.max_players == null) return null;
  return Math.max(0, event.max_players - event.participant_count);
}

type FilterPredicate<T extends FilterableEvent> = (
  event: T,
  filters: EventFilters,
  ctx: FilterContext,
) => boolean;

const FILTER_PREDICATES: FilterPredicate<FilterableEvent>[] = [
  (event, filters) =>
    filters.sport === 'all' || event.sport === filters.sport,
  (event, filters) =>
    filters.skillLevel === 'all' ||
    event.skill_level === 'any' ||
    event.skill_level === filters.skillLevel,
  (event, filters) => filters.eventType === 'all' || event.event_type === filters.eventType,
  (event, filters) =>
    filters.payment === 'all' || event.payment_status === filters.payment,
  (event, filters, ctx) =>
    matchesDateFilter(event.starts_at, filters.date, ctx.now ?? new Date()),
  (event, filters, ctx) =>
    matchesDistanceFilter(event, filters.distanceKm, ctx.userCoords),
  (event, filters) => !filters.onlyFreeSpots || hasFreeSpots(event),
];

export function applyEventFilters<T extends FilterableEvent>(
  events: T[],
  filters: EventFilters,
  ctx: FilterContext,
): T[] {
  return events.filter((event) =>
    FILTER_PREDICATES.every((predicate) => predicate(event, filters, ctx)),
  );
}

export function countFilteredEventsByField(
  events: FilterableEvent[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.field_id, (counts.get(event.field_id) ?? 0) + 1);
  }
  return counts;
}

export function isDefaultEventFilters(filters: EventFilters): boolean {
  return (
    filters.sport === DEFAULT_EVENT_FILTERS.sport &&
    filters.skillLevel === DEFAULT_EVENT_FILTERS.skillLevel &&
    filters.eventType === DEFAULT_EVENT_FILTERS.eventType &&
    filters.payment === DEFAULT_EVENT_FILTERS.payment &&
    filters.date === DEFAULT_EVENT_FILTERS.date &&
    filters.distanceKm === DEFAULT_EVENT_FILTERS.distanceKm &&
    filters.onlyFreeSpots === DEFAULT_EVENT_FILTERS.onlyFreeSpots
  );
}

export function countActiveEventFilters(filters: EventFilters): number {
  let count = 0;
  if (filters.sport !== DEFAULT_EVENT_FILTERS.sport) count += 1;
  if (filters.skillLevel !== 'all') count += 1;
  if (filters.eventType !== 'all') count += 1;
  if (filters.payment !== 'all') count += 1;
  if (filters.date !== 'all') count += 1;
  if (filters.distanceKm != null) count += 1;
  if (filters.onlyFreeSpots) count += 1;
  return count;
}

export function parseSkillLevel(value: unknown): SkillLevel {
  if (
    value === 'beginner' ||
    value === 'intermediate' ||
    value === 'advanced' ||
    value === 'any'
  ) {
    return value;
  }
  return 'any';
}

export function parseEventType(value: unknown): EventType {
  if (
    value === 'match' ||
    value === 'training' ||
    value === 'tournament' ||
    value === 'sparring' ||
    value === 'looking_for_players'
  ) {
    return value;
  }
  return 'match';
}

export function parsePaymentStatus(value: unknown): PaymentStatus {
  return value === 'paid' ? 'paid' : 'free';
}
