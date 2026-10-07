import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useDMStore } from '@/store/chat/dm';
import { useChatStore } from '@/store/chat';

vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: () => ({ displayName: 'Bob', name: null, picture: null, nip05: null, about: null, banner: null, lud16: null }),
}));
vi.mock('@/services/chat/pq/attestations', () => ({
  hasUsableKeys: vi.fn().mockResolvedValue(false),
  getAttestation: vi.fn(),
  clearAttestationCache: vi.fn(),
}));

import { useDmPanel } from '@/hooks/shell/panes/dm/useDmPanel';

const PEER = 'b'.repeat(64);

function setup(peer: string | null) {
  return renderHook(({ p }) => useDmPanel(p), { initialProps: { p: peer }, wrapper: bridgeWrapper(fakeBridge()) });
}

beforeEach(() => useDMStore.setState({ activeDMPubkey: null }));

describe('useDmPanel', () => {
  it('marks the open thread while mounted and follows a change of peer', () => {
    const { rerender, unmount } = setup(PEER);
    expect(useDMStore.getState().activeDMPubkey).toBe(PEER);
    rerender({ p: 'c'.repeat(64) });
    expect(useDMStore.getState().activeDMPubkey).toBe('c'.repeat(64));
    unmount();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('names the peer for the header', () => {
    expect(setup(PEER).result.current.thread.peerName).toBe('Bob');
  });

  it('opens the peer profile at the pointer, and one from the menu unanchored', () => {
    const openProfilePopup = vi.fn();
    useChatStore.setState({ openProfilePopup } as never);
    const { result } = setup(PEER);
    result.current.openPeerProfile({ clientX: 7, clientY: 8 } as never);
    expect(openProfilePopup).toHaveBeenCalledWith(PEER, { x: 7, y: 8 });
    result.current.openProfile('d'.repeat(64));
    expect(openProfilePopup).toHaveBeenLastCalledWith('d'.repeat(64), { x: 0, y: 0 });
  });

  it('with no peer there is no profile to open', () => {
    const openProfilePopup = vi.fn();
    useChatStore.setState({ openProfilePopup } as never);
    setup(null).result.current.openPeerProfile({ clientX: 1, clientY: 1 } as never);
    expect(openProfilePopup).not.toHaveBeenCalled();
  });
});
