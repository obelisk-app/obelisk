import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MobileSigningIndicator', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('shows green while idle because signing is healthy', async () => {
    const { default: MobileSigningIndicator } = await import('@/components/feedback/MobileSigningIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');

    render(
      <LocaleProvider initialLocale="en">
        <MobileSigningIndicator />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('mobile-signing-indicator').firstElementChild)
      .toHaveClass('bg-lc-green');
  });

  it('changes color state and explains the event being signed', async () => {
    const { pushActivity, resolveActivity } = await import('@/services/activity-log');
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
    const indicator = screen.getByTestId('mobile-signing-indicator');
    expect(indicator).toHaveAttribute('data-status', 'pending');
    fireEvent.click(indicator);
    expect(screen.getByText('Waiting for bunker signature')).toBeInTheDocument();
    expect(screen.getByText('Send message · kind 9')).toBeInTheDocument();

    resolveActivity(id);
    await waitFor(() => expect(indicator).toHaveAttribute('data-status', 'ok'));
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
    const open = () => fireEvent.click(screen.getByTestId('mobile-signing-indicator'));

    open();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveAttribute('type', 'button');
    expect(close.textContent).not.toContain('×');
    fireEvent.click(close);
    expect(screen.queryByTestId('mobile-signing-popup')).toBeNull();

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('mobile-signing-popup')).toBeNull();

    open();
    fireEvent.click(screen.getByTestId('mobile-signing-popup'));
    expect(screen.getByTestId('mobile-signing-popup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mobile-signing-popup-backdrop'));
    expect(screen.queryByTestId('mobile-signing-popup')).toBeNull();
  });
});
