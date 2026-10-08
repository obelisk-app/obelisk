/**
 * The "which wallet pays" line under the zap modal and the invoice confirm:
 * the same rule the payment follows, a connected NWC wallet first, then WebLN.
 */
import { IDBFactory } from 'fake-indexeddb';
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PayingWalletNote from '@/components/chat/zaps/PayingWalletNote';
import { FakeRelayFactory, getRelayHub, resetRelayHubForTests } from '@nostr-wot/relay/hub';
import { connectNwcWallet, ensureNwcWalletLoaded } from '@/services/wallet/nwc-wallet';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { FakeNwcWallet } from '@tests/support/fake-nwc-wallet';

let wallet: FakeNwcWallet;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  window.localStorage.clear();
  resetRelayHubForTests();
  wallet = new FakeNwcWallet();
  getRelayHub({ relayFactory: wallet.attach(new FakeRelayFactory()) });
  await ensureNwcWalletLoaded(null);
});

afterEach(async () => {
  delete window.webln;
  await act(async () => { await ensureNwcWalletLoaded(null); });
  resetRelayHubForTests();
  vi.unstubAllGlobals();
});

const renderNote = (locale: 'en' | 'es' | 'pt' = 'en') => renderWithBridge(<PayingWalletNote />, fakeBridge(), { locale });

describe('PayingWalletNote', () => {
  it('says nothing when there is no wallet', async () => {
    renderNote();
    await act(async () => {});
    expect(screen.queryByTestId('paying-wallet')).toBeNull();
  });

  it('names the WebLN extension when it is the only wallet', async () => {
    window.webln = { enable: async () => {}, sendPayment: async () => ({ preimage: 'p' }) };
    renderNote('es');
    await act(async () => {});
    expect(screen.getByTestId('paying-wallet')).toHaveTextContent('Paga con tu extensión del navegador (WebLN)');
  });

  it('names the connected wallet, even with an extension installed, after a reload', async () => {
    window.webln = { enable: async () => {}, sendPayment: async () => ({ preimage: 'p' }) };
    await ensureNwcWalletLoaded(BRIDGE_MOCK_PUBKEY);
    await connectNwcWallet(BRIDGE_MOCK_PUBKEY, wallet.uri);
    await ensureNwcWalletLoaded(null); // the reload: only the sealed record is left

    renderNote('pt');

    // While the sealed record is being opened nothing is claimed; then the connected wallet is named.
    expect(screen.queryByTestId('paying-wallet')).toBeNull();
    const note = await screen.findByTestId('paying-wallet');
    expect(note).toHaveAttribute('data-wallet', 'nwc');
    expect(note).toHaveTextContent('Paga com Test Wallet (Nostr Wallet Connect)');
  });
});
