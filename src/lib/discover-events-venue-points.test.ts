import { describe, expect, it } from 'vitest';

import type { DiscoverEvent } from '@/lib/discover-events';
import { groupEventsByVenue, soonestEvent } from '@/lib/discover-events-venue-points';

let nextId = 0;

function makeEvent(overrides: Partial<DiscoverEvent> = {}): DiscoverEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    title: 'Test event',
    category: 'sport',
    subcategory: 'basketball',
    sport: 'basketball',
    skill_level: 'any',
    event_type: 'match',
    is_instant: false,
    starts_at: new Date().toISOString(),
    duration_min: 90,
    ends_at: new Date().toISOString(),
    lat: 54.37,
    lng: 18.61,
    location_name: null,
    notes: null,
    description_long: null,
    image_url: null,
    image_urls: [],
    organizer_name: null,
    organizer_contact: null,
    organizer_url: null,
    payment_status: 'free',
    price_cents: null,
    max_players: 10,
    field_id: 'field-1',
    creator_id: 'user-1',
    creator_nick: null,
    participant_count: 0,
    is_joined: false,
    is_mine: false,
    ...overrides,
  };
}

describe('groupEventsByVenue', () => {
  it('groups multiple events at the same field into a single point', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1' }),
      makeEvent({ field_id: 'field-1' }),
      makeEvent({ field_id: 'field-1' }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].id).toBe('field-1');
    expect(points[0].eventCount).toBe(3);
  });

  it('keeps different fields as separate points', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1' }),
      makeEvent({ field_id: 'field-2' }),
    ]);
    expect(points).toHaveLength(2);
  });

  it('gives events with no field_id a synthetic per-event key instead of dropping or merging them', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: null, id: 'solo-1' }),
      makeEvent({ field_id: null, id: 'solo-2' }),
    ]);
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.id).sort()).toEqual(['event:solo-1', 'event:solo-2']);
  });

  it('skips events with no coordinates', () => {
    expect(groupEventsByVenue([makeEvent({ lat: null }), makeEvent({ lng: null })]).points).toHaveLength(0);
  });

  it('picks the most common sport among the group as the dominant one', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1', sport: 'football' }),
      makeEvent({ field_id: 'field-1', sport: 'basketball' }),
      makeEvent({ field_id: 'field-1', sport: 'basketball' }),
    ]);
    expect(points[0].sport).toBe('basketball');
  });

  it('picks the best (most inviting) availability among the group: open > filling > full', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1', participant_count: 10, max_players: 10 }), // full
      makeEvent({ field_id: 'field-1', participant_count: 2, max_players: 10 }), // open
    ]);
    expect(points[0].availability).toBe('open');
  });

  it('reports "empty" only when nothing in the group has real capacity/participants', () => {
    const { points } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1', participant_count: 0, max_players: null }),
    ]);
    expect(points[0].availability).toBe('empty');
  });

  it('exposes the raw events per venue key for tap resolution', () => {
    const { eventsByVenue } = groupEventsByVenue([
      makeEvent({ field_id: 'field-1', id: 'a' }),
      makeEvent({ field_id: 'field-1', id: 'b' }),
    ]);
    expect(eventsByVenue.get('field-1')?.map((e) => e.id).sort()).toEqual(['a', 'b']);
  });
});

describe('soonestEvent', () => {
  it('returns the event starting earliest', () => {
    const later = makeEvent({ starts_at: '2026-01-02T10:00:00.000Z' });
    const sooner = makeEvent({ starts_at: '2026-01-01T10:00:00.000Z' });
    expect(soonestEvent([later, sooner])).toBe(sooner);
  });

  it('returns null for an empty list', () => {
    expect(soonestEvent([])).toBeNull();
  });
});
