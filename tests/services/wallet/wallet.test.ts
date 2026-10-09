import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { connectWallet, walletKindFor } from '@/services/wallet/wallet';

const account = 'a'.repeat(64);
const enable = vi.fn(async () => {});
const sendPayment = vi.fn(async () => ({ preimage: 'proof' }));
beforeEach(() => { enable.mockReset(); sendPayment.mockClear(); window.webln = { enable, sendPayment }; });
afterEach(() => { unregisterBridge(); delete window.webln; });

it.each(['bunker', 'nsec'] as const)('does not select WebLN implicitly for %s', async (method) => {
  registerBridge(fakeBridge({ myPubkey: account, myLoginMethod: method }));
  expect(walletKindFor(account)).toBeNull();
  expect(await connectWallet(account)).toBeNull();
  expect(enable).not.toHaveBeenCalled();
});

it('does not pay when the account changes during extension permission', async () => {
  const bridge = fakeBridge({ myPubkey: account, myLoginMethod: 'nip07' });
  registerBridge(bridge);
  enable.mockImplementationOnce(async () => { bridge.stores.myPubkey.set('b'.repeat(64)); });
  await expect(connectWallet(account)).rejects.toThrow('Session was replaced');
  expect(sendPayment).not.toHaveBeenCalled();
});

it('retires an acquired wallet on same-key relogin before payment', async () => {
  let generation = 0;
  registerBridge(fakeBridge({ myPubkey: account, myLoginMethod: 'nip07' }, { getSessionGeneration: () => generation }));
  const wallet = await connectWallet(account);
  generation++;
  await expect(wallet!.pay('invoice')).rejects.toThrow('Session was replaced');
  expect(sendPayment).not.toHaveBeenCalled();
});
