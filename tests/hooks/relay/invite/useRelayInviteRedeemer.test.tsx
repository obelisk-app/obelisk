import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { useRelayInviteRedeemer } from '@/hooks/relay/invite/useRelayInviteRedeemer';
import { readStoredInvite, storeInvite } from '@/services/relay/relay-invite-storage';

const confirmDialog = vi.fn();
vi.mock('@/services/common/confirm-dialog', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialog(...args),
}));

const PUBLIC = 'wss://public.obelisk.ar';

function render(seed: Record<string, unknown>) {
  const addRelay = vi.fn().mockResolvedValue(undefined);
  const switchRelay = vi.fn().mockResolvedValue(undefined);
  const bridge = fakeBridge(
    { currentRelayUrl: PUBLIC, configuredRelays: [PUBLIC], ...seed },
    { addRelay, switchRelay } as unknown as Partial<BridgeImpl>,
  );
  renderHook(() => useRelayInviteRedeemer(), { wrapper: bridgeWrapper(bridge) });
  return { addRelay, switchRelay };
}

const loggedOut = { isLoggedIn: false, myPubkey: null, myLoginMethod: null };

beforeEach(() => {
  localStorage.clear();
  confirmDialog.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('useRelayInviteRedeemer: relay trust', () => {
  it('asks before taking a logged-out visitor to a relay they do not know, and nothing reaches it on a no', async () => {
    storeInvite('code', 'relay.stranger.example');
    confirmDialog.mockResolvedValue(false);
    const { addRelay, switchRelay } = render(loggedOut);
    await waitFor(() => expect(readStoredInvite()?.steer).toBe('declined'));
    expect(confirmDialog).toHaveBeenCalledOnce();
    expect(confirmDialog.mock.calls[0][0]).toMatchObject({ title: 'Join relay.stranger.example?' });
    expect(addRelay).not.toHaveBeenCalled();
    expect(switchRelay).not.toHaveBeenCalled();
  });

  it('does not ask again on a reload once the visitor said no', async () => {
    storeInvite('code', 'relay.stranger.example');
    confirmDialog.mockResolvedValue(false);
    render(loggedOut);
    await waitFor(() => expect(readStoredInvite()?.steer).toBe('declined'));
    render(loggedOut);
    await Promise.resolve();
    expect(confirmDialog).toHaveBeenCalledOnce();
  });

  it('switches after a yes', async () => {
    storeInvite('code', 'relay.stranger.example');
    confirmDialog.mockResolvedValue(true);
    const { addRelay, switchRelay } = render(loggedOut);
    await waitFor(() => expect(switchRelay).toHaveBeenCalledWith('wss://relay.stranger.example'));
    expect(addRelay).toHaveBeenCalledWith('wss://relay.stranger.example');
  });

  it('switches silently to a built-in default relay', async () => {
    storeInvite('code', 'lacrypta-relay.obelisk.ar');
    const { switchRelay } = render(loggedOut);
    await waitFor(() => expect(switchRelay).toHaveBeenCalledWith('wss://lacrypta-relay.obelisk.ar'));
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('leaves a logged-in person to the chat shell\'s deep-link gate', async () => {
    storeInvite('code', 'relay.stranger.example');
    const { addRelay, switchRelay } = render({});
    await Promise.resolve();
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(addRelay).not.toHaveBeenCalled();
    expect(switchRelay).not.toHaveBeenCalled();
    expect(readStoredInvite()?.steer).toBeUndefined();
  });
});
