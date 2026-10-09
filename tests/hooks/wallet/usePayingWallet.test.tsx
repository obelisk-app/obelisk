import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePayingWallet } from '@/hooks/wallet/usePayingWallet';
import { useNwcWalletStore } from '@/store/wallet/nwc-wallet';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

vi.mock('@/services/wallet/nwc-wallet', async (original) => ({ ...await original<typeof import('@/services/wallet/nwc-wallet')>(), ensureNwcWalletLoaded: vi.fn(async () => {}) }));
const account = 'a'.repeat(64);
beforeEach(() => {
  window.webln = { enable: vi.fn(async () => {}), sendPayment: vi.fn(async () => ({ preimage: '' })) };
  useNwcWalletStore.setState({ account, status: 'none', wallet: null });
});
afterEach(() => { delete window.webln; });

it('selects the wallet from the mounted session and reacts to pending identity checks', () => {
  const bridge = fakeBridge({ myPubkey: account, myLoginMethod: 'nip07' });
  const { result } = renderHook(usePayingWallet, { wrapper: bridgeWrapper(bridge) });
  expect(result.current.kind).toBe('webln');
  act(() => bridge.stores.extensionIdentityPending.set(true));
  expect(result.current.kind).toBeNull();
  expect(result.current.webln).toBe(false);
  act(() => bridge.stores.extensionIdentityPending.set(false));
  expect(result.current.kind).toBe('webln');
});

it('keeps a configured NWC wallet usable while the remote signer warms up', () => {
  const bridge = fakeBridge({ myPubkey: account, myLoginMethod: 'bunker', bunkerSignerReady: false });
  useNwcWalletStore.setState({ status: 'connected', wallet: { walletPubkey: 'b'.repeat(64), relays: [], alias: null, lud16: null, budget: null, remembered: false } });
  const { result } = renderHook(usePayingWallet, { wrapper: bridgeWrapper(bridge) });
  expect(result.current.kind).toBe('nwc');
  expect(result.current.webln).toBe(false);
});
