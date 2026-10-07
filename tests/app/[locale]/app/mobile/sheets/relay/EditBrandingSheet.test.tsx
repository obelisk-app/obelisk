import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { RelayBranding } from '@/services/relay/relay-branding';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});

vi.mock('@/components/media/upload/BlossomImageInput', () => ({
  default: ({ label }: { label: string }) => <div data-testid={`blossom-${label.toLowerCase()}`}>{label}</div>,
}));

import { EditBrandingSheet } from '@/app/[locale]/app/mobile/sheets/relay/EditBrandingSheet';

const branding: RelayBranding = { icon: '', banner: '', name: 'La Crypta', description: '', updatedAt: 0 };

function mount(close = vi.fn()) {
  const r = render(
    <LocaleProvider initialLocale="en">
      <EditBrandingSheet relayUrl="wss://relay.test" branding={branding} close={close} />
    </LocaleProvider>,
  );
  return { ...r, close };
}

describe('EditBrandingSheet', () => {
  it('renders the edit-branding sheet above the relay menu with the current name', () => {
    const { container } = mount();
    const host = container.querySelector('[data-screen="edit-branding"]');
    expect(host).toHaveClass('sheet-host');
    expect(host).toHaveStyle({ zIndex: 20 });
    expect(screen.getByText('Edit branding')).toBeInTheDocument();
    expect(screen.getByDisplayValue('La Crypta')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-branding-save')).toBeInTheDocument();
  });

  it('closes on Cancel and on a backdrop tap', () => {
    const { container, close } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe('EditBrandingSheet accessibility', () => {
  it('names the display-name and description fields by their visible labels', () => {
    mount();
    expect(screen.getByLabelText('Display name')).toHaveValue('La Crypta');
    expect(screen.getByLabelText('Description').tagName).toBe('TEXTAREA');
  });
});
