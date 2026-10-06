import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { DisconnectConfirmSheet } from '@/app/[locale]/app/mobile/sheets/DisconnectConfirmSheet';

function mount(onConfirm = vi.fn(), onCancel = vi.fn()) {
  const r = render(
    <LocaleProvider initialLocale="en">
      <DisconnectConfirmSheet onConfirm={onConfirm} onCancel={onCancel} />
    </LocaleProvider>,
  );
  return { ...r, onConfirm, onCancel };
}

describe('DisconnectConfirmSheet', () => {
  it('renders as the disconnect-confirm sheet with its title', () => {
    const { container } = mount();
    const host = container.querySelector('[data-screen="disconnect-confirm"]');
    expect(host).toHaveClass('sheet-host');
    expect(host?.querySelector('.sheet .sheet-handle')).not.toBeNull();
    expect(screen.getByText('Disconnect from Nostr?')).toBeInTheDocument();
  });

  it('confirms, cancels, and cancels on a backdrop tap', () => {
    const { container, onConfirm, onCancel } = mount();
    fireEvent.click(screen.getByTestId('disconnect-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
