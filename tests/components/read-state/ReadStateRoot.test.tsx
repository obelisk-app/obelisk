import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import ReadStateRoot from '@/components/read-state/ReadStateRoot';

const sync = vi.hoisted(() => ({
  requests: [] as Array<{ resolve: (value: { read: string[]; write: string[] } | null) => void; reject: (error: Error) => void }>,
  startDm: vi.fn(() => vi.fn()),
  startGroups: vi.fn(() => vi.fn()),
}));

vi.mock('@nostr-wot/data', async (original) => ({
  ...await original<typeof import('@nostr-wot/data')>(),
  fetchRelayList: () => new Promise((resolve, reject) => { sync.requests.push({ resolve, reject }); }),
}));
vi.mock('@/services/read-state/relay-sync', () => ({
  startDMRelaySync: sync.startDm,
  startGroupsRelaySync: sync.startGroups,
}));
vi.mock('@/hooks/read-state/useAutoMarkRead', () => ({ useAutoMarkRead: () => {} }));
vi.mock('@/hooks/read-state/useMentionSeen', () => ({ useMentionSeen: () => {} }));
vi.mock('@/hooks/notifications/useFaviconBadge', () => ({ useFaviconBadge: () => {} }));

beforeEach(() => {
  sync.requests = [];
  vi.clearAllMocks();
});

describe('read-state sync ownership', () => {
  it('stops the old account subscription and waits for the new account relay lookup', async () => {
    const bridge = fakeBridge({ myPubkey: 'a'.repeat(64), groupMetadataEose: true });
    renderWithBridge(<ReadStateRoot />, bridge);
    await act(async () => sync.requests[0].resolve({ read: ['wss://alice.example'], write: [] }));
    expect(sync.startDm).toHaveBeenCalledWith(['wss://alice.example']);
    const stopAlice = sync.startDm.mock.results[0].value;
    sync.startDm.mockClear();

    act(() => bridge.stores.myPubkey.set('b'.repeat(64)));
    expect(stopAlice).toHaveBeenCalledOnce();
    expect(sync.startDm).not.toHaveBeenCalled();
    await act(async () => sync.requests[1].resolve({ read: [], write: ['wss://bob.example'] }));
    expect(sync.startDm).toHaveBeenCalledExactlyOnceWith(['wss://bob.example']);
  });

  it('does not restart on the old fallback relay while resolving a new active relay', async () => {
    const bridge = fakeBridge({ currentRelayUrl: 'wss://first.example', groupMetadataEose: true });
    renderWithBridge(<ReadStateRoot />, bridge);
    await act(async () => sync.requests[0].resolve(null));
    const stopFirst = sync.startDm.mock.results[0].value;
    sync.startDm.mockClear();
    act(() => bridge.stores.currentRelayUrl.set('wss://second.example'));
    expect(stopFirst).toHaveBeenCalledOnce();
    expect(sync.startDm).not.toHaveBeenCalled();
    await act(async () => sync.requests[1].resolve(null));
    expect(sync.startDm).toHaveBeenCalledExactlyOnceWith(['wss://second.example']);
  });

  it('ignores a relay lookup that resolves after unmount', async () => {
    const bridge = fakeBridge({ groupMetadataEose: true });
    const { unmount } = renderWithBridge(<ReadStateRoot />, bridge);
    await waitFor(() => expect(sync.requests).toHaveLength(1));
    unmount();
    await act(async () => sync.requests[0].resolve({ read: ['wss://late.example'], write: [] }));
    expect(sync.startDm).not.toHaveBeenCalled();
  });

  it('waits for the DM readiness gate before looking up relays', () => {
    const bridge = fakeBridge({ groupMetadataEose: false, connectionState: 'Disconnected' });
    renderWithBridge(<ReadStateRoot />, bridge);
    expect(sync.requests).toHaveLength(0);
    act(() => bridge.stores.groupMetadataEose.set(true));
    expect(sync.requests).toHaveLength(1);
  });

  it('falls back to the active relay when the NIP-65 lookup fails', async () => {
    const bridge = fakeBridge({ currentRelayUrl: 'wss://active.example', groupMetadataEose: true });
    renderWithBridge(<ReadStateRoot />, bridge);
    await act(async () => sync.requests[0].reject(new Error('offline')));
    expect(sync.startDm).toHaveBeenCalledExactlyOnceWith(['wss://active.example']);
  });

  it('ignores the previous account lookup even if it resolves after the new one', async () => {
    const bridge = fakeBridge({ myPubkey: 'a'.repeat(64), groupMetadataEose: true });
    renderWithBridge(<ReadStateRoot />, bridge);
    act(() => bridge.stores.myPubkey.set('b'.repeat(64)));
    await act(async () => sync.requests[1].resolve({ read: ['wss://bob.example'], write: [] }));
    await act(async () => sync.requests[0].resolve({ read: ['wss://alice.example'], write: [] }));
    expect(sync.startDm).toHaveBeenCalledExactlyOnceWith(['wss://bob.example']);
  });

});
