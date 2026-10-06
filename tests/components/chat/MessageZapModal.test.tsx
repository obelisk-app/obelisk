import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});
vi.mock('@nostr-wot/wallet', () => ({ isWebLNAvailable: () => false, requestZapInvoice: vi.fn() }));
vi.mock('@nostr-wot/data', () => ({ getDefaultRelays: () => [] }));

import MessageZapModal from '@/components/chat/MessageZapModal';
import { useMessageZapStore } from '@/store/messageZap';

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
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Zap Ana');
  });

  it('names both fields by their visible captions', () => {
    mount();
    act(() => useMessageZapStore.getState().open({ recipientPubkey: RECIPIENT, displayName: 'Ana', groupId: 'g' }));
    expect(screen.getByLabelText('Amount (sats)')).toBe(screen.getByRole('spinbutton'));
    expect(screen.getByLabelText('Comment (optional)')).toBe(screen.getByPlaceholderText('Nice post!'));
  });
});
