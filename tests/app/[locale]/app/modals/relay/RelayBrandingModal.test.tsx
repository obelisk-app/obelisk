vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock();
});
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { RelayBranding } from '@/services/relay/relay-branding';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});

vi.mock('@/components/media/upload/ChannelAppearanceInput', () => ({
  default: () => <div data-testid="channel-appearance-preview" />,
}));

import { RelayBrandingModal } from '@/app/[locale]/app/modals/relay/RelayBrandingModal';

const branding: RelayBranding = { icon: '', banner: '', name: 'La Crypta', description: '', updatedAt: 0 };

function mount(onClose = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <RelayBrandingModal relayUrl="wss://relay.test" branding={branding} onClose={onClose} />
    </LocaleProvider>,
  );
  return { onClose };
}

describe('RelayBrandingModal', () => {
  it('shows the branding title, the relay in its subtitle and the current name', () => {
    mount();
    expect(screen.getByText('Relay branding')).toBeInTheDocument();
    expect(screen.getByText(/Shown to everyone on relay\.test/)).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('La Crypta');
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('closes from the header close button', () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
