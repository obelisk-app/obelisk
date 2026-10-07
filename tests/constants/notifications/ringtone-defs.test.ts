import { describe, expect, it } from 'vitest';
import { DEFAULT_RINGTONE, RINGTONE_DEFS, RINGTONES } from '@/constants/notifications/ringtone-defs';
import * as sound from '@/services/notifications/sound';

describe('ringtone-defs', () => {
  it('defines every listed ringtone, with the default among them', () => {
    expect(Object.keys(RINGTONE_DEFS).sort()).toEqual([...RINGTONES].sort());
    expect(RINGTONES).toContain(DEFAULT_RINGTONE);
  });

  it('gives every ringtone a phrase for every sound kind', () => {
    for (const id of RINGTONES) {
      const { phrases, instrument } = RINGTONE_DEFS[id];
      for (const kind of ['mention', 'reply', 'dm', 'ring', 'ringback'] as const) {
        expect(phrases[kind].length).toBeGreaterThan(0);
      }
      expect(instrument.partials.length).toBeGreaterThan(0);
      expect(instrument.wet).toBeGreaterThanOrEqual(0);
      expect(instrument.wet).toBeLessThanOrEqual(1);
    }
  });

  it('is what the sound entry point re-exports', () => {
    expect(sound.RINGTONES).toBe(RINGTONES);
    expect(sound.DEFAULT_RINGTONE).toBe(DEFAULT_RINGTONE);
  });
});
