import { describe, expect, it } from 'vitest';
import { getAppearanceCssVariables } from '@/services/preferences-appearance';
import * as entry from '@/services/preferences';

describe('preferences-appearance', () => {
  it('picks dark ink on a light button and light ink on a dark one', () => {
    const light = getAppearanceCssVariables({ accentColor: '#ffffff', backgroundColor: '#000000', buttonColor: '#ffffff', bubbleColor: '#ffffff' });
    const dark = getAppearanceCssVariables({ accentColor: '#000000', backgroundColor: '#000000', buttonColor: '#000000', bubbleColor: '#000000' });
    expect(light['--obelisk-button-ink']).toBe('#0a0a0a');
    expect(dark['--obelisk-button-ink']).toBe('#fafafa');
  });

  it('falls back to the default palette for an invalid colour', () => {
    const vars = getAppearanceCssVariables({ accentColor: 'nope', backgroundColor: '#0a0a0a', buttonColor: '#b4f953', bubbleColor: '#b4f953' });
    expect(vars['--obelisk-accent']).toBe(entry.APPEARANCE_DEFAULTS.accentColor);
  });

  it('is what the preferences entry point re-exports', () => {
    expect(entry.getAppearanceCssVariables).toBe(getAppearanceCssVariables);
  });
});
