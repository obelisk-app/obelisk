import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn(async (url: string) => (url.includes('one')
    ? { name: 'Relay One', description: 'The first one', icon: 'https://icons/one.png' }
    : null)),
  SUGGESTED_RELAYS: [{ url: 'wss://relay.one.test' }, { url: 'wss://relay.two.test' }],
}));

import { AddRelaySheet } from '@/app/[locale]/app/mobile/sheets/relay/AddRelaySheet';

function mount() {
  renderWithBridge(<AddRelaySheet close={vi.fn()} />, fakeBridge({ configuredRelays: ['wss://relay.one.test'] }));
}

describe('AddRelaySheet suggestions', () => {
  it('fills a suggestion from its NIP-11 document and marks a relay already in the rail', async () => {
    mount();
    expect(await screen.findByText('Relay One')).toBeInTheDocument();
    expect(screen.getByText('The first one')).toBeInTheDocument();
    const added = screen.getByRole('button', { name: 'Added' });
    expect(added).toBeDisabled();
    const icon = document.querySelector('img[src="https://icons/one.png"]');
    expect(icon).not.toBeNull();
  });

  it('falls back to the favicon without a document and to a letter when the image fails', async () => {
    mount();
    await waitFor(() => expect(document.querySelector('img[src="https://favicon/wss://relay.two.test"]')).not.toBeNull());
    fireEvent.error(document.querySelector('img[src="https://favicon/wss://relay.two.test"]')!);
    expect(document.querySelector('img[src="https://favicon/wss://relay.two.test"]')).toBeNull();
    expect(screen.getByText('R')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).not.toBeDisabled();
  });

  it('switches to the custom URL form', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Custom URL' }));
    expect(screen.getByLabelText('Relay URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom URL' })).toHaveClass('active');
  });
});
