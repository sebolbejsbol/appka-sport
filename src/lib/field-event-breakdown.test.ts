import { describe, expect, it } from 'vitest';

import { bucketEventsBySport } from '@/lib/field-event-breakdown';

describe('bucketEventsBySport', () => {
  it('counts events per sport, sorted by count descending', () => {
    const events = [
      { sport: 'basketball' },
      { sport: 'football' },
      { sport: 'basketball' },
      { sport: 'basketball' },
      { sport: 'football' },
    ];
    expect(bucketEventsBySport(events)).toEqual([
      { sport: 'basketball', count: 3 },
      { sport: 'football', count: 2 },
    ]);
  });

  it('returns an empty array for no events', () => {
    expect(bucketEventsBySport([])).toEqual([]);
  });
});
