import { describe, expect, it } from 'vitest';
import { relayKey, socialRelayPresetChips } from '@/utils/settings/social-relays';

const PRESETS = [{ url: 'wss://a.example', note: 'general' }, { url: 'wss://b.example', note: 'search' }] as const;

describe('social relay helpers', () => {
  it('relayKey trims and drops a trailing slash', () => {
    expect(relayKey(' wss://a.example/ ')).toBe('wss://a.example');
  });

  it('marks a preset already in the draft and disables it', () => {
    const [a, b] = socialRelayPresetChips(PRESETS, ['wss://a.example/'], true);
    expect(a).toEqual({ url: 'wss://a.example', host: 'a.example', note: 'general', added: true, disabled: true });
    expect(b).toMatchObject({ host: 'b.example', added: false, disabled: false });
  });

  it('a full list disables the rest unless a blank row is waiting', () => {
    expect(socialRelayPresetChips(PRESETS, ['wss://x.example'], false)[1].disabled).toBe(true);
    expect(socialRelayPresetChips(PRESETS, ['wss://x.example', ' '], false)[1].disabled).toBe(false);
  });
});
