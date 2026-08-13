import { describe, expect, it } from 'vitest';

import { Brand } from '@/constants/theme';
import {
  buildAvailabilityMatchExpression,
  buildClusterCategoryProperties,
  buildClusterDominantIconExpression,
  buildClusterStatusColorExpression,
  CLUSTER_ICON_SPORTS,
  dominantCategory,
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

describe('dominantCategory', () => {
  it('picks the category with the highest count', () => {
    expect(dominantCategory({ basketball: 2, football: 5, tennis: 1 })).toBe('football');
  });

  it('breaks ties by priority order (earlier in CLUSTER_ICON_SPORTS wins)', () => {
    expect(dominantCategory({ football: 3, basketball: 3 })).toBe('basketball');
    expect(dominantCategory({ hockey: 4, tennis: 4, basketball: 4 })).toBe('basketball');
  });

  it('returns null when nothing is present', () => {
    expect(dominantCategory({})).toBeNull();
    expect(dominantCategory({ basketball: 0, other: 0 })).toBeNull();
  });

  it('can resolve to "other" when it outnumbers every tracked sport', () => {
    expect(dominantCategory({ basketball: 1, other: 5 })).toBe('other');
  });
});

describe('buildClusterDominantIconExpression', () => {
  it('produces a case expression comparing every category against all others', () => {
    const expr = buildClusterDominantIconExpression();
    expect(expr[0]).toBe('case');
    // 'case' + one [condition, output] pair per category + a trailing 'generic' fallback
    expect(expr).toHaveLength(1 + 2 * (CLUSTER_ICON_SPORTS.length + 1) + 1);
    expect(expr.at(-1)).toBe('generic');
    // "other" resolves to the neutral 'generic' icon, not a literal "other" image key
    const otherIndex = expr.findIndex((v: unknown) => v === 'other');
    expect(otherIndex).toBe(-1);
  });
});
