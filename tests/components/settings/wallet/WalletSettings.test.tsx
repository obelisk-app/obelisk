/**
 * Settings > Wallet, desktop and phone: paste a link, see where it points,
 * connect, see the wallet, disconnect. Real hooks and services over the page
 * hub on fake relays and a fake wallet service.
 */
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WalletSettings from '@/components/settings/wallet/WalletSettings';
import { FakeRelayFactory, getRelayHub, resetRelayHubForTests } from '@/lib/relay-hub';
import { ensureNwcWalletLoaded } from '@/services/wallet/nwc-wallet';
import { nwcRecordKey } from '@/services/wallet/nwc-storage';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { FakeNwcWallet } from '@tests/support/fake-nwc-wallet';

let wallet: FakeNwcWallet;

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  window.localStorage.clear();
  resetRelayHubForTests();
  wallet = new FakeNwcWallet({ relay: 'wss://relay.wallet.example' });
  getRelayHub({ relayFactory: wallet.attach(new FakeRelayFactory()) });
  await ensureNwcWalletLoaded(null);
});

afterEach(async () => {
  delete window.webln;
  await act(async () => { await ensureNwcWalletLoaded(null); });
  resetRelayHubForTests();
  vi.unstubAllGlobals();
});

async function renderSettings(opts: { mobile?: boolean; locale?: 'en' | 'es' | 'pt' } = {}) {
  renderWithBridge(<WalletSettings mobile={opts.mobile} />, fakeBridge(), { locale: opts.locale });
  await screen.findByTestId('nwc-connect-form');
}

async function connect() {
  fireEvent.change(screen.getByTestId('nwc-uri-input'), { target: { value: wallet.uri } });
  await act(async () => { fireEvent.click(screen.getByTestId('nwc-connect')); });
  await screen.findByTestId('nwc-connected');
}

describe('WalletSettings', () => {
  it.each([false, true])('connects a pasted link and shows the wallet (mobile: %s)', async (mobile) => {
    await renderSettings({ mobile });
    expect(screen.getByTestId('nwc-warning')).toHaveTextContent('lets Obelisk spend from that wallet, up to the limits you set in the wallet');
    expect(screen.getByTestId('nwc-connect')).toBeDisabled();

    fireEvent.change(screen.getByTestId('nwc-uri-input'), { target: { value: wallet.uri } });
    expect(screen.getByTestId('nwc-preview')).toHaveTextContent('relay.wallet.example');
    expect(screen.getByTestId('nwc-preview')).toHaveTextContent(/npub1/);

    await act(async () => { fireEvent.click(screen.getByTestId('nwc-connect')); });
    await screen.findByTestId('nwc-connected');

    expect(screen.getByTestId('nwc-wallet-name')).toHaveTextContent('Test Wallet');
    expect(screen.getByTestId('nwc-wallet-relay')).toHaveTextContent('relay.wallet.example');
    expect(screen.getByTestId('nwc-budget')).toHaveTextContent('Spending limit: 21 of 100 sats used, renews every month');
    expect(screen.getByTestId('nwc-storage-note')).toHaveTextContent('Stored encrypted in this browser');
    expect(screen.getByTestId('wallet-current-payer')).toHaveTextContent('Payments now use: This connected wallet');
    expect(screen.queryByTestId('nwc-uri-input')).toBeNull();
  });

  it('says why a link is not valid, and does not offer Connect', async () => {
    await renderSettings();
    fireEvent.change(screen.getByTestId('nwc-uri-input'), { target: { value: 'nostr+walletconnect://abc?relay=wss://r.example' } });
    expect(screen.getByTestId('nwc-uri-invalid')).toHaveTextContent('That is not a Nostr Wallet Connect link.');
    expect(screen.getByTestId('nwc-connect')).toBeDisabled();
  });

  it('shows the wallet\'s refusal in the reader\'s language', async () => {
    const readOnly = new FakeNwcWallet({ methods: 'get_balance' });
    resetRelayHubForTests();
    getRelayHub({ relayFactory: readOnly.attach(new FakeRelayFactory()) });
    renderWithBridge(<WalletSettings />, fakeBridge(), { locale: 'es' });
    await screen.findByTestId('nwc-connect-form');
    fireEvent.change(screen.getByTestId('nwc-uri-input'), { target: { value: readOnly.uri } });
    await act(async () => { fireEvent.click(screen.getByTestId('nwc-connect')); });

    expect(await screen.findByTestId('nwc-connect-error')).toHaveTextContent('Esa conexión no tiene permiso para pagar invoices.');
  });

  it('disconnects: the record goes and the form comes back', async () => {
    await renderSettings();
    await connect();
    expect(window.localStorage.getItem(nwcRecordKey(BRIDGE_MOCK_PUBKEY))).not.toBeNull();

    await act(async () => { fireEvent.click(screen.getByTestId('nwc-disconnect')); });

    await screen.findByTestId('nwc-connect-form');
    expect(await screen.findByRole('status')).toHaveTextContent('Wallet disconnected.');
    expect(window.localStorage.getItem(nwcRecordKey(BRIDGE_MOCK_PUBKEY))).toBeNull();
  });

  it('says a WebLN extension pays while no wallet is connected, and that a connected one takes over', async () => {
    window.webln = { enable: async () => {}, sendPayment: async () => ({ preimage: 'p' }) };
    await renderSettings();
    expect(screen.getByTestId('wallet-current-payer')).toHaveTextContent('Payments now use: Your browser extension (WebLN)');
    await connect();
    await waitFor(() => expect(screen.getByTestId('wallet-current-payer')).toHaveTextContent('This connected wallet'));
  });

  it('without IndexedDB, says the connection lasts for this visit only', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await renderSettings();
    await connect();
    expect(screen.getByTestId('nwc-storage-note')).toHaveTextContent('lasts only until you close or reload this page');
  });
});
