import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});
vi.mock('@nostr-wot/wallet', () => ({ isWebLNAvailable: () => false, requestZapInvoice: vi.fn() }));
vi.mock('@nostr-wot/data', () => ({ getDefaultRelays: () => [] }));

import MessageZapModal from '@/components/chat/zaps/MessageZapModal';
import { useMessageZapStore } from '@/store/chat/message-zap';

const RECIPIENT = 'c'.repeat(64);

function mount() {
  render(<LocaleProvider initialLocale="en"><MessageZapModal /></LocaleProvider>);
}

describe('MessageZapModal', () => {
  beforeEach(() => {
    act(() => useMessageZapStore.getState().close());
  });

  it('renders nothing without a target', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the amount (defaulting to the target) and comment fields and the quick amounts', () => {
    mount();
    act(() => useMessageZapStore.getState().open({ recipientPubkey: RECIPIENT, displayName: 'Ana', groupId: 'g', defaultAmountSats: 500 }));
    const amount = screen.getByRole('spinbutton');
    expect(amount).toHaveValue(500);
    expect(amount).toHaveAttribute('min', '1');
    fireEvent.click(screen.getByRole('button', { name: '21,000' }));
    expect(amount).toHaveValue(21000);
    const comment = screen.getByPlaceholderText('Nice post!');
    expect(comment).toHaveAttribute('maxlength', '200');
    fireEvent.change(comment, { target: { value: 'gm' } });
    expect(comment).toHaveValue('gm');
    // The shared ModalHeader renders the dialog's title as its <h2>, with a close button.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Zap Ana');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('names both fields by their visible captions', () => {
    mount();
    act(() => useMessageZapStore.getState().open({ recipientPubkey: RECIPIENT, displayName: 'Ana', groupId: 'g' }));
    expect(screen.getByLabelText('Amount (sats)')).toBe(screen.getByRole('spinbutton'));
    expect(screen.getByLabelText('Comment (optional)')).toBe(screen.getByPlaceholderText('Nice post!'));
  });

  it('sends with the yellow zap pill, the same yellow as every zap in the app', () => {
    mount();
    act(() => useMessageZapStore.getState().open({ recipientPubkey: RECIPIENT, displayName: 'Ana', groupId: 'g', defaultAmountSats: 500 }));
    const send = screen.getByRole('button', { name: 'Zap 500 sats' });
    expect(send).toHaveClass('bg-yellow-400', 'rounded-full');
    expect(send.querySelector('svg')).not.toBeNull();
  });

  it('an amount that is not a number reads as 0 and cannot be sent; a quick amount is marked', () => {
    mount();
    act(() => useMessageZapStore.getState().open({ recipientPubkey: RECIPIENT, displayName: 'Ana', groupId: 'g', defaultAmountSats: 500 }));
    const amount = screen.getByRole('spinbutton');
    fireEvent.change(amount, { target: { value: '' } });
    expect(amount).toHaveValue(0);
    expect(screen.getByRole('button', { name: 'Zap 0 sats' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '21,000' }));
    expect(screen.getByRole('button', { name: '21,000' })).toHaveClass('bg-yellow-400');
  });
});
