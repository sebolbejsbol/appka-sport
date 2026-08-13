import { describe, expect, it } from 'vitest';

import { dedupeNearbyFields, type DedupableField } from '@/lib/field-dedupe';

// ~0.0002 deg lat ≈ 22m — inside the merge threshold; ~0.01 deg ≈ 1.1km — well outside it.
function field(overrides: Partial<DedupableField>): DedupableField {
  return {
    id: 'a',
    name: null,
    sport: 'basketball',
    lng: 18.6,
    lat: 54.35,
    event_count: 0,
    availability: undefined,
    ...overrides,
  };
}

describe('dedupeNearbyFields', () => {
  it('leaves a single field untouched', () => {
    const fields = [field({ id: 'a' })];
    expect(dedupeNearbyFields(fields)).toEqual(fields);
  });

  it('leaves distant same-sport fields separate', () => {
    const fields = [field({ id: 'a', lat: 54.35 }), field({ id: 'b', lat: 54.36 })];
    expect(dedupeNearbyFields(fields)).toHaveLength(2);
  });

  it('leaves nearby different-sport fields separate', () => {
    const fields = [
      field({ id: 'a', sport: 'basketball', lat: 54.35, lng: 18.6 }),
      field({ id: 'b', sport: 'tennis', lat: 54.3502, lng: 18.6 }),
    ];
    expect(dedupeNearbyFields(fields)).toHaveLength(2);
  });

  it('merges nearby same-sport fields into one, summing event_count', () => {
    const fields = [
      field({ id: 'a', lat: 54.35, lng: 18.6, event_count: 2 }),
      field({ id: 'b', lat: 54.3502, lng: 18.6, event_count: 1 }),
    ];
    const result = dedupeNearbyFields(fields);
    expect(result).toHaveLength(1);
    expect(result[0].event_count).toBe(3);
  });

  it('merges transitively (A~B, B~C) even when A and C alone exceed the threshold', () => {
    // Each hop ~22m; three hops ~66m total between the endpoints, still merged as a chain.
    const fields = [
      field({ id: 'a', lat: 54.35, lng: 18.6 }),
      field({ id: 'b', lat: 54.3502, lng: 18.6 }),
      field({ id: 'c', lat: 54.3504, lng: 18.6 }),
    ];
    expect(dedupeNearbyFields(fields)).toHaveLength(1);
  });

  it('prefers a named field as the merge representative over an anonymous one', () => {
    const fields = [
      field({ id: 'a', name: null, lat: 54.35, lng: 18.6 }),
      field({ id: 'b', name: 'Siłownia plenerowa', lat: 54.3502, lng: 18.6 }),
    ];
    const result = dedupeNearbyFields(fields);
    expect(result[0].name).toBe('Siłownia plenerowa');
  });

  it('picks the best availability among merged fields (open > filling > full > empty)', () => {
    const fields = [
      field({ id: 'a', lat: 54.35, lng: 18.6, availability: 'full' }),
      field({ id: 'b', lat: 54.3502, lng: 18.6, availability: 'open' }),
    ];
    const result = dedupeNearbyFields(fields);
    expect(result[0].availability).toBe('open');
  });

  it('treats fitness and outdoor_gym as the same category (OSM tags the same real thing differently)', () => {
    const fields = [
      field({ id: 'a', sport: 'fitness', lat: 54.35, lng: 18.6 }),
      field({ id: 'b', sport: 'outdoor_gym', lat: 54.3502, lng: 18.6 }),
    ];
    expect(dedupeNearbyFields(fields)).toHaveLength(1);
  });
});
