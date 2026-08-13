import { describe, expect, it } from 'vitest';

import { Brand } from '@/constants/theme';
import {
  buildAvailabilityMatchExpression,
  buildClusterStatusColorExpression,
  getAvailabilityColor,
  MAP_STATUS_COLORS,
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
