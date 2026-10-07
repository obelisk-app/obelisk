import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { npubEncode } from 'nostr-tools/nip19';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { useDmsListScreen } from '@/hooks/shell/mobile/screens/dm/useDmsListScreen';
import { useComposeDmScreen } from '@/hooks/shell/mobile/screens/dm/useComposeDmScreen';

vi.mock('@/hooks/identity/useNostrUserSearch', () => ({
  useNostrUserSearch: () => ({ directHit: null, nip05Hit: null, nostrResults: [], loading: false }),
}));

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const dm = (peer: string, createdAt: number) => ({ id: `${peer}${createdAt}`, counterparty: peer, outgoing: false, content: '', createdAt });
const wrapper = () => bridgeWrapper(fakeBridge({ dmsByPeer: { [A]: [dm(A, 1)], [B]: [dm(B, 2)] } }));

beforeEach(() => setPreference('directMessagesEnabled', true));
afterEach(() => setPreference('directMessagesEnabled', false));

describe('useDmsListScreen', () => {
  it('shows the followed conversations first, the others on the other tab', () => {
    const { result } = renderHook(() => useDmsListScreen([A]), { wrapper: wrapper() });
    expect(result.current).toMatchObject({ tab: 'follows', followsCount: 1, othersCount: 1 });
    expect(result.current.shown.map((p) => p.peer)).toEqual([A]);
    act(() => result.current.setTab('others'));
    expect(result.current.shown.map((p) => p.peer)).toEqual([B]);
  });
});

describe('useComposeDmScreen', () => {
  it('lists recent conversations and searches from two characters', () => {
    const { result } = renderHook(() => useComposeDmScreen(vi.fn()), { wrapper: wrapper() });
    expect(result.current.recent).toEqual([A, B]);
    act(() => result.current.setQuery(' a '));
    expect(result.current.searching).toBe(false);
    act(() => result.current.setQuery('al'));
    expect(result.current.searching).toBe(true);
  });

  it('opens the conversation for a typed npub, and does nothing without one', () => {
    const selectPeer = vi.fn();
    const { result } = renderHook(() => useComposeDmScreen(selectPeer), { wrapper: wrapper() });
    act(() => result.current.next());
    expect(selectPeer).not.toHaveBeenCalled();
    act(() => result.current.setQuery(npubEncode(B)));
    expect(result.current.canNext).toBe(true);
    act(() => result.current.next());
    expect(selectPeer).toHaveBeenCalledWith(B);
  });
});
