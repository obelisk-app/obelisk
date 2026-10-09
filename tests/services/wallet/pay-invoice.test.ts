import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvoicePayError,
  invoiceRefusal,
  isInvoiceExpired,
  payInvoice,
} from '@/services/wallet/pay-invoice';
import { useInvoicePaymentsStore } from '@/store/wallet/invoice-payments';
import { resetAllClientState } from '@/services/common/reset';
import type { ParsedInvoice } from '@/utils/wallet/bolt11';

// A fake WebLN provider only: nothing here can reach a real wallet or network.
const NOW_MS = Date.UTC(2026, 9, 6, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const PAYER = 'a'.repeat(64);

function invoice(over: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    paymentHash: 'h'.repeat(64),
    amountSats: 21,
    amountMsats: 21_000,
    description: 'coffee',
    timestamp: NOW_S - 60,
    expiresAt: NOW_S + 3600,
    ...over,
  };
}

let webln: {
  enable: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sendPayment: ReturnType<typeof vi.fn<(invoice: string) => Promise<{ preimage: string }>>>;
};

beforeEach(() => {
  registerBridge(fakeBridge({ myPubkey: PAYER, myLoginMethod: 'nip07' }));
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  webln = {
    enable: vi.fn<() => Promise<void>>(async () => {}),
    sendPayment: vi.fn<(invoice: string) => Promise<{ preimage: string }>>(async () => ({ preimage: 'p' })),
  };
  window.webln = webln;
  useInvoicePaymentsStore.setState({ byHash: {} });
});

afterEach(() => {
  unregisterBridge();
  delete window.webln;
  vi.useRealTimers();
});

describe('payInvoice', () => {
  it('pays through the wallet once and records the invoice as paid by the payer', async () => {
    await payInvoice('lnbc1raw', invoice(), PAYER);

    expect(webln.enable).toHaveBeenCalledTimes(1);
    expect(webln.sendPayment).toHaveBeenCalledWith('lnbc1raw');
    expect(useInvoicePaymentsStore.getState().byHash['h'.repeat(64)]).toEqual({
      status: 'paid', payerPubkey: PAYER, paidAt: NOW_MS,
    });
  });

  it('pays once when asked twice at the same moment', async () => {
    const first = payInvoice('lnbc1raw', invoice(), PAYER);
    const second = payInvoice('lnbc1raw', invoice(), PAYER);

    await expect(second).rejects.toEqual(new InvoicePayError('inProgress'));
    await first;
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses an invoice it already paid', async () => {
    await payInvoice('lnbc1raw', invoice(), PAYER);
    await expect(payInvoice('lnbc1raw', invoice(), PAYER)).rejects.toEqual(new InvoicePayError('alreadyPaid'));
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('gives the invoice back when the wallet fails, so it can be paid again', async () => {
    webln.sendPayment.mockRejectedValueOnce(new Error('route not found'));
    await expect(payInvoice('lnbc1raw', invoice(), PAYER)).rejects.toThrow('route not found');
    expect(useInvoicePaymentsStore.getState().byHash).toEqual({});

    await payInvoice('lnbc1raw', invoice(), PAYER);
    expect(webln.sendPayment).toHaveBeenCalledTimes(2);
  });

  it('gives the invoice back when the wallet refuses permission', async () => {
    webln.enable.mockRejectedValueOnce(new Error('user rejected'));
    await expect(payInvoice('lnbc1raw', invoice(), PAYER)).rejects.toThrow('user rejected');
    expect(webln.sendPayment).not.toHaveBeenCalled();
    expect(useInvoicePaymentsStore.getState().byHash).toEqual({});
  });

  it('refuses an expired invoice without asking the wallet', async () => {
    await expect(payInvoice('lnbc1raw', invoice({ expiresAt: NOW_S - 1 }), PAYER))
      .rejects.toEqual(new InvoicePayError('expired'));
    expect(webln.enable).not.toHaveBeenCalled();
  });

  it('refuses an invoice with no amount: WebLN has no way to be told one', async () => {
    await expect(payInvoice('lnbc1raw', invoice({ amountSats: 0, amountMsats: 0 }), PAYER))
      .rejects.toEqual(new InvoicePayError('noAmount'));
    expect(webln.enable).not.toHaveBeenCalled();
  });

  it('pays an invoice for less than a sat (the amount is checked in millisats)', async () => {
    await payInvoice('lnbc1raw', invoice({ amountSats: 0, amountMsats: 500 }), PAYER);
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses with noWallet when there is no wallet, and leaves nothing claimed', async () => {
    delete window.webln;
    await expect(payInvoice('lnbc1raw', invoice(), PAYER)).rejects.toEqual(new InvoicePayError('noWallet'));
    expect(useInvoicePaymentsStore.getState().byHash).toEqual({});
  });
});

describe('invoiceRefusal', () => {
  it('names the first reason, paid state first', () => {
    useInvoicePaymentsStore.getState().markPaid('h'.repeat(64), PAYER);
    expect(invoiceRefusal(invoice({ expiresAt: NOW_S - 1 }))).toBe('alreadyPaid');
    useInvoicePaymentsStore.setState({ byHash: {} });
    expect(invoiceRefusal(invoice({ amountMsats: 0, expiresAt: NOW_S - 1 }))).toBe('noAmount');
    expect(invoiceRefusal(invoice({ expiresAt: NOW_S - 1 }))).toBe('expired');
    expect(invoiceRefusal(invoice(), PAYER)).toBeNull();
  });

  it('treats an expiry of 0 as none, as the card does', () => {
    expect(isInvoiceExpired(invoice({ expiresAt: 0 }), NOW_MS)).toBe(false);
    expect(isInvoiceExpired(invoice({ expiresAt: NOW_S }), NOW_MS)).toBe(false);
    expect(isInvoiceExpired(invoice({ expiresAt: NOW_S - 1 }), NOW_MS)).toBe(true);
  });
});

describe('on logout', () => {
  it('forgets who paid, but keeps a payment still in flight claimed', () => {
    const store = useInvoicePaymentsStore.getState();
    store.markPaid('paid'.padEnd(64, '0'), PAYER);
    store.claim('busy'.padEnd(64, '0'));

    resetAllClientState();

    expect(useInvoicePaymentsStore.getState().byHash).toEqual({ ['busy'.padEnd(64, '0')]: { status: 'paying' } });
  });
});
