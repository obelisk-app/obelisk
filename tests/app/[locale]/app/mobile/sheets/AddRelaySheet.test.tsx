import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useConfiguredRelays: () => ['wss://relay.one.test'] });
});

vi.mock('@/services/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
  SUGGESTED_RELAYS: [{ url: 'wss://relay.one.test' }, { url: 'wss://relay.two.test' }],
}));

import { AddRelaySheet } from '@/app/[locale]/app/mobile/sheets/AddRelaySheet';

function mount(close = vi.fn()) {
  const r = render(<LocaleProvider initialLocale="en"><AddRelaySheet close={close} /></LocaleProvider>);
  return { ...r, close };
}

describe('AddRelaySheet', () => {
  it('renders the add-relay sheet with its title and the suggested tab', () => {
    const { container } = mount();
    const host = container.querySelector('[data-screen="add-relay"]');
    expect(host).toHaveClass('sheet-host');
    expect(screen.getByText('Add a relay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suggested' })).toHaveClass('active');
    expect(screen.getAllByText('relay.two.test').length).toBeGreaterThan(0);
  });

  it('closes on Close and on a backdrop tap', () => {
    const { container, close } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe('AddRelaySheet custom tab accessibility', () => {
  it('names the URL field by its visible label', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Custom URL' }));
    const field = screen.getByLabelText('Relay URL');
    expect(field.tagName).toBe('INPUT');
    expect(field).toHaveClass('setup-input');
  });
});
