import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MobileSigningIndicator', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('shows one amber dot while relay connectivity is unknown', async () => {
    const { default: MobileSigningIndicator } = await import('@/components/feedback/MobileSigningIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');

    render(
      <LocaleProvider initialLocale="en">
        <MobileSigningIndicator />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('relay-status-pill').firstElementChild)
      .toHaveClass('bg-amber-400');
  });

  it('changes color state and explains the event being signed', async () => {
    const { pushActivity, resolveActivity } = await import('@/services/feedback/activity-log');
    const { default: MobileSigningIndicator } = await import('@/components/feedback/MobileSigningIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');
    const id = pushActivity('signBunker', undefined, {
      operation: 'sign',
      eventKind: 9,
      description: 'message',
    });

    render(
      <LocaleProvider initialLocale="en">
        <MobileSigningIndicator />
      </LocaleProvider>,
    );
    const indicator = screen.getByTestId('relay-status-pill');
    expect(indicator).toHaveAttribute('data-signing-status', 'pending');
    fireEvent.click(indicator);
    expect(screen.getByText('Waiting for bunker signature')).toBeInTheDocument();
    expect(screen.getByText('Send message')).toBeInTheDocument();

    resolveActivity(id);
    await waitFor(() => expect(indicator).toHaveAttribute('data-signing-status', 'ok'));
  });
});

describe('MobileSigningIndicator popup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('closes from the labelled close icon, Escape and the backdrop', async () => {
    const { default: MobileSigningIndicator } = await import('@/components/feedback/MobileSigningIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');
    render(
      <LocaleProvider initialLocale="en">
        <MobileSigningIndicator />
      </LocaleProvider>,
    );
    const open = () => fireEvent.click(screen.getByTestId('relay-status-pill'));

    open();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAttribute('type', 'button');
    expect(close.textContent).not.toContain('×');
    fireEvent.click(close);
    expect(screen.queryByTestId('relay-status-popover')).toBeNull();

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('relay-status-popover')).toBeNull();

    open();
    fireEvent.click(screen.getByTestId('relay-status-popover'));
    expect(screen.getByTestId('relay-status-popover')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog').previousElementSibling!);
    expect(screen.queryByTestId('relay-status-popover')).toBeNull();
  });
});
