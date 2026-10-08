import { act, renderHook } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';
import { describe, expect, it, vi } from 'vitest';
import { useMyFollows, useMyFollowSet } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const AUTHOR = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const contacts = (tags: string[][]): NostrEvent => ({
  id: 'contacts', pubkey: AUTHOR, kind: 3, created_at: 1, sig: '', content: '', tags,
});

describe('shared follows', () => {
  it('parses a contact event once across independently mounted rows', () => {
    const event = contacts([['p', AUTHOR.toUpperCase()], ['p', AUTHOR], ['p', 'invalid'], ['e', OTHER]]);
    const values = event.tags;
    const tags = vi.spyOn(event, 'tags', 'get').mockReturnValue(values);
    const wrapper = bridgeWrapper(fakeBridge({ myContactList: event }));
    const set = renderHook(() => useMyFollowSet(), { wrapper });
    expect(set.result.current.has(AUTHOR)).toBe(true);
    const first = renderHook(() => useMyFollows(), { wrapper });
    for (let row = 0; row < 100; row++) {
      const next = renderHook(() => useMyFollows(), { wrapper });
      expect(next.result.current).toBe(first.result.current);
      expect(renderHook(() => useMyFollowSet(), { wrapper }).result.current).toBe(set.result.current);
    }
    expect(first.result.current).toEqual([AUTHOR]);
    expect(tags).toHaveBeenCalledTimes(1);
  });

  it('updates on replacement and clears on logout without leaking between bridges', () => {
    const bridge = fakeBridge({ myContactList: contacts([['p', AUTHOR]]) });
    const wrapper = bridgeWrapper(bridge);
    const hook = renderHook(() => useMyFollows(), { wrapper });
    const set = renderHook(() => useMyFollowSet(), { wrapper });
    const other = renderHook(() => useMyFollows(), {
      wrapper: bridgeWrapper(fakeBridge({ myContactList: contacts([['p', OTHER]]) })),
    });
    expect(other.result.current).toEqual([OTHER]);
    expect(hook.result.current).toEqual([AUTHOR]);
    act(() => bridge.stores.myContactList.set(contacts([['p', OTHER]])));
    expect(hook.result.current).toEqual([OTHER]);
    expect(set.result.current.has(AUTHOR)).toBe(false);
    expect(set.result.current.has(OTHER)).toBe(true);
    act(() => bridge.stores.myContactList.set(null));
    expect(hook.result.current).toEqual([]);
    expect(set.result.current.size).toBe(0);
    expect(other.result.current).toEqual([OTHER]);
  });
});
