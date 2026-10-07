import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge/facade/client', () => ({ getBridge: async () => ({}), getBridgeImpl: () => null }));

import { EMPTY_MEDIA, finishCall, useDmCallStore } from '@/store/call/dm-call-store';
import * as entry from '@/store/call/dm-call';
import { rt } from '@/store/call/dm-call-runtime';

afterEach(() => {
  entry.__resetDmCallsForTests();
  vi.useRealTimers();
});

describe('dm-call-store', () => {
  it('finishCall ends the session, shows the reason, then closes after the linger', () => {
    vi.useFakeTimers();
    const end = vi.fn();
    rt.session = { end } as unknown as NonNullable<typeof rt.session>;
    useDmCallStore.setState({ status: 'active', peer: 'p', callId: 'c' });

    finishCall('remote-hangup');
    expect(end).toHaveBeenCalledWith('remote-hangup');
    expect(rt.session).toBeNull();
    expect(useDmCallStore.getState()).toMatchObject({ status: 'ended', endReason: 'remote-hangup', media: EMPTY_MEDIA });

    vi.advanceTimersByTime(5000);
    expect(useDmCallStore.getState().status).toBe('idle');
  });

  it('dismiss leaves a call in progress alone', () => {
    useDmCallStore.setState({ status: 'active', peer: 'p', callId: 'c' });
    useDmCallStore.getState().dismiss();
    expect(useDmCallStore.getState().status).toBe('active');
  });

  it('is the store the dm-call entry point re-exports', () => {
    expect(entry.useDmCallStore).toBe(useDmCallStore);
  });
});
