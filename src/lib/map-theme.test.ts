import { describe, expect, it } from 'vitest';

import { Brand } from '@/constants/theme';
import {
  buildAvailabilityMatchExpression,
  buildClusterCategoryProperties,
  buildClusterIconSizeExpression,
  buildClusterIconSlotExpression,
  buildClusterIconSlotOffsetExpression,
  buildClusterIconSlotVisibleFilter,
  buildClusterStatusColorExpression,
  CLUSTER_GRID_MAX_SLOTS,
  CLUSTER_ICON_SPORTS,
  clusterIconSlots,
  getAvailabilityColor,
  MAP_STATUS_COLORS,
  presentCategories,
} from '@/lib/map-theme';

describe('getAvailabilityColor', () => {
  it('maps each availability state to the expected brand color', () => {
    expect(getAvailabilityColor('open')).toBe(Brand.success);
    expect(getAvailabilityColor('filling')).toBe(Brand.warning);
    expect(getAvailabilityColor('full')).toBe(Brand.danger);
    expect(getAvailabilityColor('empty')).toBe('#94a3b8');
  });
});

describe('buildClusterStatusColorExpression', () => {
  it('produces a case expression prioritizing open > filling > full > empty', () => {
    expect(buildClusterStatusColorExpression()).toEqual([
      'case',
      ['>', ['get', 'open_count'], 0], MAP_STATUS_COLORS.open,
      ['>', ['get', 'filling_count'], 0], MAP_STATUS_COLORS.filling,
      ['>', ['get', 'full_count'], 0], MAP_STATUS_COLORS.full,
      MAP_STATUS_COLORS.empty,
    ]);
  });
});

describe('buildAvailabilityMatchExpression', () => {
  it('produces a match expression over the availability property', () => {
    expect(buildAvailabilityMatchExpression()).toEqual([
      'match',
      ['get', 'availability'],
      'full', MAP_STATUS_COLORS.full,
      'filling', MAP_STATUS_COLORS.filling,
      'open', MAP_STATUS_COLORS.open,
      MAP_STATUS_COLORS.empty,
    ]);
  });
});

describe('buildClusterCategoryProperties', () => {
  it('has one count_* property per CLUSTER_ICON_SPORTS entry plus count_other', () => {
    const props = buildClusterCategoryProperties();
    for (const sport of CLUSTER_ICON_SPORTS) {
      expect(props[`count_${sport}`]).toBeDefined();
    }
    expect(props.count_other).toBeDefined();
    expect(Object.keys(props)).toHaveLength(CLUSTER_ICON_SPORTS.length + 1);
  });
});

describe('presentCategories', () => {
  it('returns only categories with a positive count, in priority order', () => {
    expect(presentCategories({ football: 3, basketball: 2, other: 1 })).toEqual([
      'basketball',
      'football',
      'other',
    ]);
  });

  it('ignores zero/missing counts', () => {
    expect(presentCategories({ basketball: 0, football: undefined })).toEqual([]);
    expect(presentCategories({})).toEqual([]);
  });
});

describe('clusterIconSlots', () => {
  it('centers a single category', () => {
    expect(clusterIconSlots({ basketball: 3 })).toEqual(['basketball']);
  });

  it('keeps 2, 3, and exactly 4 categories as real icons (no overflow glyph)', () => {
    expect(clusterIconSlots({ basketball: 1, football: 1 })).toEqual(['basketball', 'football']);
    expect(clusterIconSlots({ basketball: 1, football: 1, tennis: 1 })).toEqual([
      'basketball',
      'football',
      'tennis',
    ]);
    expect(clusterIconSlots({ basketball: 1, football: 1, tennis: 1, volleyball: 1 })).toEqual([
      'basketball',
      'football',
      'tennis',
      'volleyball',
    ]);
  });

  it('caps at 3 real icons + a "more" glyph for 5+ categories, never exceeding CLUSTER_GRID_MAX_SLOTS', () => {
    const slots = clusterIconSlots({
      basketball: 1,
      football: 1,
      tennis: 1,
      volleyball: 1,
      hockey: 1,
    });
    expect(slots).toEqual(['basketball', 'football', 'tennis', 'more']);
    expect(slots).toHaveLength(CLUSTER_GRID_MAX_SLOTS);
  });

  it('never returns more than CLUSTER_GRID_MAX_SLOTS entries for any input', () => {
    const allPresent = Object.fromEntries(CLUSTER_ICON_SPORTS.map((s) => [s, 1]));
    expect(clusterIconSlots({ ...allPresent, other: 1 }).length).toBeLessThanOrEqual(CLUSTER_GRID_MAX_SLOTS);
  });
});

describe('buildClusterIconSlotVisibleFilter', () => {
  it('requires slot index + 1 present categories', () => {
    expect(buildClusterIconSlotVisibleFilter(0)).toEqual(['>=', expect.anything(), 1]);
    expect(buildClusterIconSlotVisibleFilter(3)).toEqual(['>=', expect.anything(), 4]);
  });
});

describe('buildClusterIconSlotExpression', () => {
  it('slot 3 falls back to the "more" glyph when the count exceeds CLUSTER_GRID_MAX_SLOTS', () => {
    const expr = buildClusterIconSlotExpression(3);
    expect(expr[0]).toBe('case');
    // ['case', [>, total, 4], 'more', <slot-3-category-expr>]
    expect(expr[1][0]).toBe('>');
    expect(expr[2]).toBe('bubble_more');
  });

  it('slots 0-2 resolve to a plain case expression over present/rank checks', () => {
    const expr = buildClusterIconSlotExpression(0);
    expect(expr[0]).toBe('case');
    expect(expr.at(-1)).toBe('bubble_generic'); // trailing fallback
  });
});

describe('buildClusterIconSizeExpression', () => {
  it('is a step expression over total_events, growing monotonically at each threshold', () => {
    const expr = buildClusterIconSizeExpression();
    expect(expr[0]).toBe('step');
    expect(expr[1]).toEqual(['get', 'total_events']);
    // ['step', input, base, stop1, val1, stop2, val2, stop3, val3] -> 9 entries
    expect(expr).toHaveLength(9);
    const sizes = [expr[2], expr[4], expr[6], expr[8]] as number[];
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });
});

describe('buildClusterIconSlotOffsetExpression', () => {
  it('returns a case expression keyed on the present-category count', () => {
    const expr = buildClusterIconSlotOffsetExpression(0);
    expect(expr[0]).toBe('case');
  });

  it('embeds a step expression (per size tier) as the offset value, not a bare literal', () => {
    const expr = buildClusterIconSlotOffsetExpression(2); // slot 2 has no case branching, just the tiered step
    expect(expr[0]).toBe('step');
    expect(expr[1]).toEqual(['get', 'total_events']);
  });
});
