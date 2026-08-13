import { describe, expect, it } from 'vitest';

import { fieldMarkerColor, fieldMarkerEmoji, fieldMarkerIcon, isFieldSport } from '@/lib/sports';

describe('fieldMarkerColor/Emoji/Icon', () => {
  it('resolves the new hockey entry', () => {
    expect(fieldMarkerColor('hockey')).toBe('#1d4ed8');
    expect(fieldMarkerEmoji('hockey')).toBe('🏒');
    expect(fieldMarkerIcon('hockey')).toBe('hockey');
    expect(isFieldSport('hockey')).toBe(true);
  });

  it('takes the first discipline for multi-sport (";"-joined) courts', () => {
    expect(fieldMarkerColor('hockey;football')).toBe(fieldMarkerColor('hockey'));
    expect(fieldMarkerEmoji('basketball;football')).toBe(fieldMarkerEmoji('basketball'));
    expect(fieldMarkerIcon('tennis;padel')).toBe(fieldMarkerIcon('tennis'));
  });

  it('falls back to defaults for unknown or missing sport', () => {
    expect(fieldMarkerColor(null)).toBe('#1f6bff');
    expect(fieldMarkerEmoji(undefined)).toBe('📍');
    expect(fieldMarkerIcon('')).toBe('generic');
    expect(fieldMarkerIcon('some_unknown_sport')).toBe('generic');
  });
});
