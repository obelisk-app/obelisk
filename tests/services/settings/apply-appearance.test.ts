import { describe, expect, it } from 'vitest';
import { applyAppearance } from '@/services/settings/apply-appearance';
import { getAppearanceCssVariables, getPreferences } from '@/services/preferences/preferences';

describe('applyAppearance', () => {
  it('sets every colour variable and the bubble animation on the element', () => {
    const el = document.createElement('div');
    const prefs = { ...getPreferences(), accentColor: '#7ec8ff', bubbleAnimation: 'still' as const };
    applyAppearance(el, prefs);
    for (const [name, value] of Object.entries(getAppearanceCssVariables(prefs))) {
      expect(el.style.getPropertyValue(name)).toBe(value);
    }
    expect(el.dataset.bubbleAnimation).toBe('still');
  });
});
