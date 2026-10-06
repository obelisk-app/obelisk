import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  // The form's lazy sfu-pin import awaits getBridge(); the shared mock leaves it undefined.
  return bridgeMock({ getBridge: async () => ({}) as never });
});

vi.mock('@/components/media/BlossomImageInput', () => ({
  ChannelAppearanceInput: () => <div data-testid="channel-appearance-preview" />,
}));

import { ChannelSettingsModal } from '@/app/[locale]/app/modals/ChannelSettingsModal';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';

const group = groupFixture({ id: 'rly/general', name: 'general' });

function mount(onClose = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <ChannelSettingsModal group={group} onClose={onClose} />
    </LocaleProvider>,
  );
  return { onClose };
}

describe('ChannelSettingsModal', () => {
  it('names the channel in its title and seeds the name field', () => {
    mount();
    expect(screen.getByText('Channel settings · #general')).toBeInTheDocument();
    expect(screen.getByDisplayValue('general')).toBeInTheDocument();
  });

  it('closes from the header close button', () => {
    const { onClose } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ChannelSettingsModal SFU field', () => {
  it('is named by its visible label once the big-room kind is picked', () => {
    mount();
    fireEvent.click(screen.getByText('Big-room voice'));
    const field = screen.getByLabelText('SFU URL');
    expect(field).toHaveAttribute('placeholder', 'https://sfu.obelisk.ar');
    expect(field).toHaveClass('font-mono', 'text-xs', 'px-2', 'py-1.5');
  });
});
