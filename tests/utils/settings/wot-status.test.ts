import { describe, expect, it } from 'vitest';
import { wotStatusView } from '@/utils/settings/wot-status';

describe('wotStatusView', () => {
  it('is green when the extension answers, red on its error, muted when it is missing', () => {
    expect(wotStatusView('configured')).toEqual({ labelKey: 'settings.wot.status.configured', toneClass: 'text-lc-green' });
    expect(wotStatusView('error')).toEqual({ labelKey: 'settings.wot.status.error', toneClass: 'text-red-400' });
    expect(wotStatusView('absent')).toEqual({ labelKey: 'settings.wot.status.missing', toneClass: 'text-lc-muted' });
  });
});
