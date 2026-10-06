import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedInvoice } from '@/utils/bolt11';

const parsed = vi.hoisted(() => ({ current: null as ParsedInvoice | null }));
vi.mock('@/utils/bolt11', () => ({
  parseBolt11: () => {
    if (!parsed.current) throw new Error('bad invoice');
    return parsed.current;
  },
}));

import InvoiceCard from '@/components/chat/InvoiceCard';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { useInvoicePaymentsStore } from '@/store/invoice-payments';
import { useToastStore } from '@/store/toast';

// Every wallet here is a fake WebLN provider: no test can pay or reach a network.

const NOW = new Date('2026-10-05T12:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const RAW = 'lnbc210n1fakeinvoicefortests';

function setInvoice(over: Partial<ParsedInvoice> = {}) {
  parsed.current = {
    paymentHash: 'e'.repeat(64),
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

function renderCard(locale: 'en' | 'es' = 'en') {
  return renderWithBridge(<InvoiceCard invoice={RAW} />, fakeBridge(), { locale });
}

/** Pay, then Confirm, and let the fake wallet answer. */
async function payAndConfirm() {
  fireEvent.click(screen.getByTestId('invoice-pay-btn'));
  await act(async () => { fireEvent.click(screen.getByTestId('invoice-confirm-btn')); });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setInvoice();
  useInvoicePaymentsStore.setState({ byHash: {} });
  webln = {
    enable: vi.fn<() => Promise<void>>(async () => {}),
    sendPayment: vi.fn<(invoice: string) => Promise<{ preimage: string }>>(async () => ({ preimage: 'p' })),
  };
  window.webln = webln;
});

afterEach(() => {
  delete window.webln;
  vi.useRealTimers();
});

describe('InvoiceCard paying', () => {
  it('shows the amount and description and pays only after one confirm click', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));

    const confirm = screen.getByTestId('invoice-confirm');
    expect(confirm).toHaveTextContent('Pay 21 sats from your wallet?');
    expect(confirm).toHaveTextContent('For: coffee');
    expect(screen.getByTestId('paying-wallet')).toHaveTextContent('Pays with your browser extension (WebLN)');
    expect(webln.sendPayment).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByTestId('invoice-confirm-btn')); });

    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
    expect(webln.sendPayment).toHaveBeenCalledWith(RAW);
    expect(screen.getByTestId('invoice-paid')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
  });

  it('pays nothing when the confirm is cancelled', () => {
    renderCard();
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));
    fireEvent.click(screen.getByTestId('invoice-cancel-btn'));
    expect(screen.queryByTestId('invoice-confirm')).toBeNull();
    expect(screen.getByTestId('invoice-pay-btn')).toBeEnabled();
    expect(webln.enable).not.toHaveBeenCalled();
  });

  it('pays once when Confirm is clicked twice before the card re-renders', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));
    const btn = screen.getByTestId('invoice-confirm-btn');
    await act(async () => { btn.click(); btn.click(); });
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('invoice-paid')).toBeInTheDocument();
  });

  it('disables Pay on every card for the invoice while the wallet works', async () => {
    let finish: (v: { preimage: string }) => void = () => {};
    webln.sendPayment.mockImplementation(() => new Promise((r) => { finish = r; }));
    renderWithBridge(<><InvoiceCard invoice={RAW} /><InvoiceCard invoice={RAW} /></>, fakeBridge());
    const [first, second] = screen.getAllByTestId('invoice-pay-btn');

    fireEvent.click(first);
    await act(async () => { fireEvent.click(screen.getByTestId('invoice-confirm-btn')); });

    for (const btn of screen.getAllByTestId('invoice-pay-btn')) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent('Paying…');
    }
    fireEvent.click(second);
    expect(screen.queryByTestId('invoice-confirm')).toBeNull();

    await act(async () => { finish({ preimage: 'p' }); });
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('invoice-paid')).toHaveLength(2);
  });

  it('stays paid across a re-render and a remount', async () => {
    const { rerender, unmount } = renderCard();
    await payAndConfirm();

    rerender(<InvoiceCard invoice={RAW} />);
    expect(screen.getByTestId('invoice-paid')).toBeInTheDocument();
    unmount();

    renderCard();
    expect(screen.getByTestId('invoice-paid')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('does not offer Pay again when something fails after the wallet reported success', async () => {
    const pushToast = useToastStore.getState().pushToast;
    useToastStore.setState({ pushToast: () => { throw new Error('toast broke'); } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderCard();
      await payAndConfirm();

      expect(screen.getByTestId('invoice-paid')).toBeInTheDocument();
      expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
      expect(screen.queryByTestId('invoice-error')).toBeNull();
      expect(webln.sendPayment).toHaveBeenCalledTimes(1);
    } finally {
      useToastStore.setState({ pushToast });
      warn.mockRestore();
    }
  });

  it('says what to do when there is no wallet, and asks nothing', () => {
    delete window.webln;
    renderCard();
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));
    expect(screen.queryByTestId('invoice-confirm')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/No Lightning wallet to pay with\. Connect one in Settings > Wallet with Nostr Wallet Connect, or install a WebLN extension such as Alby/);
  });

  it('shows a wallet error in the reader\'s language and lets them try again', async () => {
    webln.sendPayment.mockRejectedValueOnce(new Error('Route not found after 3 attempts'));
    renderCard('es');
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));
    await act(async () => { fireEvent.click(screen.getByTestId('invoice-confirm-btn')); });

    expect(screen.getByRole('alert')).toHaveTextContent('El pago no se pudo hacer.');
    expect(screen.queryByText(/Route not found/)).toBeNull();
    expect(screen.getByTestId('invoice-pay-btn')).toBeEnabled();
    expect(screen.queryByTestId('invoice-paid')).toBeNull();
  });

  it('refuses an invoice with no amount and says why', () => {
    setInvoice({ amountSats: 0, amountMsats: 0 });
    renderCard();
    expect(screen.getByText('No amount set')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-no-amount')).toHaveTextContent(/Obelisk can only pay invoices that do/);
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
  });

  it('drops the confirm and refuses when the invoice expires while it is open', () => {
    setInvoice({ expiresAt: NOW_S + 2 });
    renderCard();
    fireEvent.click(screen.getByTestId('invoice-pay-btn'));
    expect(screen.getByTestId('invoice-confirm')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.queryByTestId('invoice-confirm')).toBeNull();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(webln.enable).not.toHaveBeenCalled();
  });

  it('shows an undecodable invoice as invalid', () => {
    parsed.current = null;
    renderCard();
    expect(screen.getByText('⚠️ Invalid invoice')).toBeInTheDocument();
  });
});

describe('InvoiceCard expiry', () => {
  it('flips to Expired at the expiry instant without an unrelated re-render', () => {
    // The card used to read the clock during render, so an invoice only
    // noticed it had expired when something else happened to re-render it.
    setInvoice({ expiresAt: NOW_S + 2 });
    renderCard();

    expect(screen.getByTestId('invoice-pay-btn')).toBeInTheDocument();
    expect(screen.queryByText('Expired')).toBeNull();

    // expiresAt is 12:00:02; "expired" means expiresAt < floor(now), so the
    // flip is due at 12:00:03.
    act(() => { vi.advanceTimersByTime(2_999); });
    expect(screen.getByTestId('invoice-pay-btn')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('renders an already-expired invoice as Expired on first paint', () => {
    setInvoice({ expiresAt: NOW_S - 60 });
    renderCard();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
  });

  it('never expires an invoice that carries no expiry', () => {
    setInvoice({ expiresAt: 0 });
    renderCard();
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
    expect(screen.getByTestId('invoice-pay-btn')).toBeInTheDocument();
  });
});
