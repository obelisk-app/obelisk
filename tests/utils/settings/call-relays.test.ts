import { describe, expect, it } from 'vitest';
import { callRelaysToSave, isBadRelayDraft, isWssRelay } from '@/utils/settings/call-relays';

describe('call relay helpers', () => {
  it('isWssRelay takes wss:// without credentials only', () => {
    expect(isWssRelay(' wss://relay.example ')).toBe(true);
    expect(isWssRelay('ws://relay.example')).toBe(false);
    expect(isWssRelay('https://relay.example')).toBe(false);
    expect(isWssRelay('wss://user:pw@relay.example')).toBe(false);
    expect(isWssRelay('not a url')).toBe(false);
  });

  it('isBadRelayDraft leaves a blank row alone', () => {
    expect(isBadRelayDraft('  ')).toBe(false);
    expect(isBadRelayDraft('https://x')).toBe(true);
    expect(isBadRelayDraft('wss://x.example')).toBe(false);
  });

  it('callRelaysToSave drops blank rows and refuses an empty or bad list', () => {
    expect(callRelaysToSave([' wss://a.example ', '', 'wss://b.example'])).toEqual(['wss://a.example', 'wss://b.example']);
    expect(callRelaysToSave(['', ' '])).toBeNull();
    expect(callRelaysToSave(['wss://a.example', 'https://b.example'])).toBeNull();
  });
});
