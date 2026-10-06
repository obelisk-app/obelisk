import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useMyPubkey: () => 'a'.repeat(64),
    useNipSigner: () => null,
    useUserMetadata: () => null,
  });
});

const parsed = vi.hoisted(() => ({ expiresAt: 0 }));
vi.mock('@/utils/bolt11', () => ({
  parseBolt11: () => ({
    amountSats: 21,
    description: 'coffee',
    expiresAt: parsed.expiresAt,
  }),
}));

import InvoiceCard from '@/components/chat/InvoiceCard';
import { LocaleProvider } from '@/i18n/context';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

const NOW = new Date('2026-10-05T12:00:00Z');

describe('InvoiceCard expiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flips to Expired at the expiry instant without an unrelated re-render', () => {
    // The card used to read the clock during render, so an invoice only
    // noticed it had expired when something else happened to re-render it.
    parsed.expiresAt = Math.floor(NOW.getTime() / 1000) + 2;
    renderLocalized(<InvoiceCard invoice="lnbc210n1fake" />);

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
    parsed.expiresAt = Math.floor(NOW.getTime() / 1000) - 60;
    renderLocalized(<InvoiceCard invoice="lnbc210n1fake" />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-pay-btn')).toBeNull();
  });

  it('never expires an invoice that carries no expiry', () => {
    parsed.expiresAt = 0;
    renderLocalized(<InvoiceCard invoice="lnbc210n1fake" />);
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
    expect(screen.getByTestId('invoice-pay-btn')).toBeInTheDocument();
  });
});
