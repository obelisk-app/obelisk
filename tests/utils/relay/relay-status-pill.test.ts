import { describe, expect, it } from 'vitest';
import { accessDotClass, activeRelayState } from '@/utils/relay/relay-status-pill';

describe('activeRelayState', () => {
  it('is connected only when the relay lets the session read', () => {
    expect(activeRelayState('ok')).toBe('connected');
  });

  it('reads as connecting while the challenge is pending or the verdict unknown', () => {
    expect(activeRelayState('authenticating')).toBe('connecting');
    expect(activeRelayState('unknown')).toBe('connecting');
  });

  it('fails for every refusal', () => {
    for (const access of ['auth-required', 'restricted', 'unreachable', 'error'] as const) {
      expect(activeRelayState(access)).toBe('failed');
    }
  });
});

describe('accessDotClass', () => {
  it('colours each verdict', () => {
    expect(accessDotClass('ok')).toBe('bg-lc-green');
    expect(accessDotClass('authenticating')).toContain('animate-pulse');
    expect(accessDotClass('unknown')).toBe('bg-lc-border');
    expect(accessDotClass('restricted')).toBe('bg-red-500');
  });
});
