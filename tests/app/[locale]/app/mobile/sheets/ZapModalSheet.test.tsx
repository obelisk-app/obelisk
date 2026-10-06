import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({});
});

import { ZapModalSheet } from '@/app/[locale]/app/mobile/sheets/ZapModalSheet';

const msg = { id: 'e'.repeat(64), pubkey: 'a'.repeat(64), content: 'gm' };

describe('ZapModalSheet', () => {
  it('renders the zap-modal sheet with its title and the message', () => {
    const { container } = render(
      <LocaleProvider initialLocale="en"><ZapModalSheet msg={msg} close={() => {}} /></LocaleProvider>,
    );
    const host = container.querySelector('[data-screen="zap-modal"]');
    expect(host).toHaveClass('sheet-host');
    expect(screen.getByText('Send a zap')).toBeInTheDocument();
    expect(screen.getByText(/gm/)).toBeInTheDocument();
  });

  it('closes on a backdrop tap', () => {
    const close = vi.fn();
    const { container } = render(
      <LocaleProvider initialLocale="en"><ZapModalSheet msg={msg} close={close} /></LocaleProvider>,
    );
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
