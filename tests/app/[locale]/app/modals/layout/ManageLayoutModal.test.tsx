vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock();
});
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { EMPTY_LAYOUT } from '@/constants/relay/channel-layout';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});

import { ManageLayoutModal } from '@/app/[locale]/app/modals/layout/ManageLayoutModal';

function mount(onClose = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <ManageLayoutModal relayUrl="wss://relay.test" layout={EMPTY_LAYOUT} channels={[]} onClose={onClose} />
    </LocaleProvider>,
  );
  return { onClose };
}

describe('ManageLayoutModal', () => {
  it('shows the layout title with the relay in its subtitle', () => {
    mount();
    expect(screen.getByText('Categories & order')).toBeInTheDocument();
    expect(screen.getByText(/Shared layout for relay\.test/)).toBeInTheDocument();
  });

  it('closes from the header close button', () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ManageLayoutModal accessibility', () => {
  it('names the category rename field and each channel category picker', async () => {
    const { groupFixture } = await import('@tests/support/mocks/nostr-bridge');
    render(
      <LocaleProvider initialLocale="en">
        <ManageLayoutModal
          relayUrl="wss://relay.test"
          layout={{ categories: [{ id: 'c1', name: 'Dev', position: 0 }], channels: [], updatedAt: 0 }}
          channels={[groupFixture({ id: 'rly/general', name: 'general' })]}
          onClose={vi.fn()}
        />
      </LocaleProvider>,
    );
    expect(screen.getByLabelText('Category name')).toHaveValue('Dev');
    const picker = screen.getByLabelText('Category for general');
    expect(picker.tagName).toBe('SELECT');
    expect(picker).toHaveClass('px-1.5', 'py-0.5', 'bg-lc-dark');
  });
});
