import { describe, expect, it } from 'vitest';
import { normalizeAppearance, sanitizeHexColor } from '@/schemas/preferences/appearance';
import { APPEARANCE_DEFAULTS } from '@/constants/preferences/appearance';

describe('appearance schema', () => {
  it.each([null, undefined, false, 42, 'bad', []])('defaults malformed input: %j', (value) => {
    expect(normalizeAppearance(value)).toEqual(APPEARANCE_DEFAULTS);
  });
  it('normalizes colors and rejects arbitrary CSS and unsupported motion', () => {
    expect(normalizeAppearance({ accentColor: ' #ABCDEF ', backgroundColor: 'url(evil)', buttonColor: '#abc', bubbleAnimation: 'teleport' })).toEqual({ ...APPEARANCE_DEFAULTS, accentColor: '#abcdef' });
    expect(sanitizeHexColor(42, '#000000')).toBe('#000000');
  });
});
