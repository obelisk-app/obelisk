/**
 * Paying over Nostr Wallet Connect through the app's one wallet path
 * (`src/services/wallet/wallet.ts`): invoices and zaps, which wallet wins,
 * wallet errors in the reader's language, a silent wallet, and the
 * double-pay guards. Fake hub relays, fake wallet service, fake WebLN; no
 * network.
 */
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ requestZapInvoice: vi.fn() }));
vi.mock('@nostr-wot/wallet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nostr-wot/wallet')>()),
  // The LNURL round trip is the only part of a zap that is not the wallet's.
  requestZapInvoice: sdk.requestZapInvoice,
}));

import { FakeRelayFactory, getRelayHub, resetRelayHubForTests } from '@/lib/relay-hub';
import { mayHavePaid } from '@/lib/nwc';
import { connectNwcWallet, disconnectNwcWallet, ensureNwcWalletLoaded } from '@/services/wallet/nwc-wallet';
import { connectWallet, walletKindFor } from '@/services/wallet/wallet';
import { payInvoice, InvoicePayError } from '@/services/wallet/pay-invoice';
import { checkZap, sendZap } from '@/services/wallet/send-zap';
import { useInvoicePaymentsStore } from '@/store/wallet/invoice-payments';
import { errorText } from '@/utils/errors/error-text';
import type { ParsedInvoice } from '@/utils/wallet/bolt11';
import { translator } from '@tests/support/intl';
import { FakeNwcWallet } from '@tests/support/fake-nwc-wallet';

const USER = 'a'.repeat(64);
const OTHER = 'd'.repeat(64);
const HASH = 'h'.repeat(64);

function parsed(): ParsedInvoice {
  const now = Math.floor(Date.now() / 1000);
  return { paymentHash: HASH, amountSats: 21, amountMsats: 21_000, description: 'coffee', timestamp: now - 60, expiresAt: now + 3600 };
}

let wallet: FakeNwcWallet;
let webln: {
  enable: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sendPayment: ReturnType<typeof vi.fn<(invoice: string) => Promise<{ preimage: string }>>>;
};

beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  window.localStorage.clear();
  resetRelayHubForTests();
  wallet = new FakeNwcWallet();
  getRelayHub({ relayFactory: wallet.attach(new FakeRelayFactory()) });
  webln = {
    enable: vi.fn<() => Promise<void>>(async () => {}),
    sendPayment: vi.fn<(invoice: string) => Promise<{ preimage: string }>>(async () => ({ preimage: 'webln' })),
  };
  window.webln = webln;
  useInvoicePaymentsStore.setState({ byHash: {} });
  await ensureNwcWalletLoaded(null);
  await ensureNwcWalletLoaded(USER);
  await connectNwcWallet(USER, wallet.uri);
});

afterEach(async () => {
  vi.useRealTimers();
  delete window.webln;
  await ensureNwcWalletLoaded(null);
  resetRelayHubForTests();
  vi.unstubAllGlobals();
});

describe('which wallet pays', () => {
  it('a connected NWC wallet wins over a WebLN extension, for that account only', async () => {
    expect(walletKindFor(USER)).toBe('nwc');
    expect((await connectWallet(USER))?.kind).toBe('nwc');
    expect(webln.enable).not.toHaveBeenCalled();

    expect(walletKindFor(OTHER)).toBe('webln');
    expect(walletKindFor(null)).toBe('webln');
  });

  it('falls back to WebLN once the wallet is disconnected, and to none without an extension', async () => {
    await disconnectNwcWallet();
    expect(walletKindFor(USER)).toBe('webln');
    delete window.webln;
    expect(walletKindFor(USER)).toBeNull();
    expect(await connectWallet(USER)).toBeNull();
  });
});

describe('paying an invoice over NWC', () => {
  it('pays once through the wallet service, never through WebLN, and records it paid', async () => {
    await payInvoice('lnbc1raw', parsed(), USER);

    expect(wallet.calls('pay_invoice').map((r) => r.params)).toEqual([{ invoice: 'lnbc1raw' }]);
    expect(webln.sendPayment).not.toHaveBeenCalled();
    expect(useInvoicePaymentsStore.getState().byHash[HASH]).toMatchObject({ status: 'paid', payerPubkey: USER });
  });

  it('two Confirms at once still send one pay_invoice', async () => {
    const results = await Promise.allSettled([
      payInvoice('lnbc1raw', parsed(), USER),
      payInvoice('lnbc1raw', parsed(), USER),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(InvoicePayError);
    expect(wallet.calls('pay_invoice')).toHaveLength(1);
  });

  it('turns the wallet\'s error into a sentence in the reader\'s language, and leaves the invoice payable', async () => {
    wallet.respond = () => ({ error: { code: 'INSUFFICIENT_BALANCE', message: 'not enough sats' } });
    const err = await payInvoice('lnbc1raw', parsed(), USER).catch((e: unknown) => e);

    expect(errorText(translator('es'), err, 'chat.invoice.payFailed')).toBe('Tu billetera no tiene fondos suficientes.');
    expect(errorText(translator('pt'), err, 'chat.invoice.payFailed')).toBe('Sua carteira não tem saldo suficiente.');
    expect(errorText(translator('en'), err, 'chat.invoice.payFailed')).toBe('Your wallet does not have enough funds.');
    expect(useInvoicePaymentsStore.getState().byHash[HASH]).toBeUndefined();
  });

  it('a silent wallet times out as "check your wallet", not as a plain failure', async () => {
    wallet.respond = () => 'silent';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = payInvoice('lnbc1raw', parsed(), USER).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(61_000);
    const err = await pending;

    expect(err).toMatchObject({ code: 'wallet-timeout' });
    expect(mayHavePaid(err)).toBe(true);
    expect(errorText(translator('en'), err, 'chat.invoice.payFailed')).toMatch(/check your wallet before trying again/);
    expect(wallet.calls('pay_invoice')).toHaveLength(1);
  });
});

describe('zapping over NWC', () => {
  const signer = { pubkey: USER, signEvent: vi.fn() };
  const draft = {
    recipient: { recipientPubkey: 'c'.repeat(64), groupId: 'g1', messageId: 'm1' },
    amountSats: 21,
    comment: '',
    lud16: 'ana@example.com',
    signer,
    currentRelay: null,
  };

  beforeEach(() => {
    sdk.requestZapInvoice.mockResolvedValue({ invoice: 'lnbc1zap', zapRequest: { id: 'zr' } });
  });

  it('pays the zap invoice through the connected wallet', async () => {
    delete window.webln;
    const check = checkZap(draft);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const result = await sendZap(check.zap);

    expect(wallet.calls('pay_invoice').map((r) => r.params.invoice)).toEqual(['lnbc1zap']);
    // No bridge in this suite: the zap is paid, only its channel marker could not be posted.
    expect(result.markerError).toBe('no-bridge');
  });

  it('a silent wallet rejects with an error that says money may have moved', async () => {
    wallet.respond = () => 'silent';
    const check = checkZap(draft);
    if (!check.ok) throw new Error('fixture should be valid');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = sendZap(check.zap).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(61_000);

    expect(mayHavePaid(await pending)).toBe(true);
  });
});
