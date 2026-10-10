import { describe, expect, it } from 'vitest';
import { getAppearanceCssVariables } from '@/utils/preferences/appearance';
import { APPEARANCE_DEFAULTS } from '@/constants/preferences/appearance';

describe('preferences-appearance', () => {
  it('picks dark ink on a light button and light ink on a dark one', () => {
    const light = getAppearanceCssVariables({ accentColor: '#ffffff', backgroundColor: '#000000', buttonColor: '#ffffff', bubbleColor: '#ffffff' });
    const dark = getAppearanceCssVariables({ accentColor: '#000000', backgroundColor: '#000000', buttonColor: '#000000', bubbleColor: '#000000' });
    expect(light['--obelisk-button-ink']).toBe('#0a0a0a');
    expect(dark['--obelisk-button-ink']).toBe('#fafafa');
  });

  it('falls back to the default palette for an invalid colour', () => {
    const vars = getAppearanceCssVariables({ accentColor: 'nope', backgroundColor: '#0a0a0a', buttonColor: '#b4f953', bubbleColor: '#b4f953' });
    expect(vars['--obelisk-accent']).toBe(APPEARANCE_DEFAULTS.accentColor);
  });

});
