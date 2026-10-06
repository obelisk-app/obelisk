import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The component reads its copy from the dictionary, so it needs a provider -
 * and the provider has to come from the same module instance the component
 * imported, which `vi.resetModules()` below makes a live question.
 */
const renderLocalized = async (ui: React.ReactElement) => {
  const { LocaleProvider } = await import('@tests/support/intl');
  return render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
};


vi.mock('@/app/[locale]/app/RelayStatusBanner', () => ({ default: () => 'relay status' }));

describe('ActivityIndicator', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('prioritizes typed signing waits and renders the event kind description', async () => {
    const { pushActivity } = await import('@/services/activity-log');
    const { default: ActivityIndicator } = await import('@/components/feedback/ActivityIndicator');

    pushActivity('publish', undefined, { operation: 'publish', eventKind: 9 });
    pushActivity('signExtension', undefined, {
      operation: 'sign',
      eventKind: 22242,
      description: 'relayAuth',
    });

    await renderLocalized(<ActivityIndicator />);

    expect(screen.getByTestId('activity-indicator')).toHaveClass('hidden', 'lg:flex');
    expect(screen.getByText('Waiting for extension signature')).toBeInTheDocument();
    expect(screen.getByText('NIP-42 relay auth · kind 22242')).toBeInTheDocument();
    expect(screen.queryByText('Publishing to relays')).toBeNull();
    expect(screen.getByText('relay status')).toBeInTheDocument();
  });

  it('dismisses a failed activity from an icon, not a glyph', async () => {
    const { pushActivity, failActivity } = await import('@/services/activity-log');
    const { default: ActivityIndicator } = await import('@/components/feedback/ActivityIndicator');
    const id = pushActivity('publish', undefined, { operation: 'publish', eventKind: 9 });
    failActivity(id, 'publish-rejected');

    await renderLocalized(<ActivityIndicator />);
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss.querySelector('svg')).not.toBeNull();
    expect(dismiss.textContent).toBe('');
    act(() => { fireEvent.click(dismiss); });
    expect(screen.queryByText('Publish failed')).toBeNull();
  });

  it('hides the signing and publishing lifecycle on mobile', async () => {
    const { pushActivity } = await import('@/services/activity-log');
    const { default: ActivityIndicator } = await import('@/components/feedback/ActivityIndicator');
    pushActivity('signExtension', undefined, { operation: 'sign' });
    pushActivity('publish', undefined, { operation: 'publish' });

    await renderLocalized(<ActivityIndicator hideSigning />);

    expect(screen.queryByText('Waiting for extension signature')).toBeNull();
    expect(screen.queryByText('Publishing to relays')).toBeNull();
    expect(screen.getByText('relay status')).toBeInTheDocument();
  });

  it('reads a coded entry in the reader\'s language: title by status, failure by code', async () => {
    const { pushActivity, failActivity } = await import('@/services/activity-log');
    const { default: ActivityIndicator } = await import('@/components/feedback/ActivityIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');
    const id = pushActivity('publish', undefined, { operation: 'publish', eventKind: 9, description: 'message' });
    failActivity(id, 'publish-rejected');

    render(<LocaleProvider initialLocale="es"><ActivityIndicator /></LocaleProvider>);

    expect(screen.getByText('No se pudo publicar')).toBeInTheDocument();
    expect(screen.getByText('Ningún relay aceptó esto.')).toBeInTheDocument();
  });

  it('puts the relay host into the authenticating title and keeps an uncoded label as it is', async () => {
    const { pushActivity } = await import('@/services/activity-log');
    const { default: ActivityIndicator } = await import('@/components/feedback/ActivityIndicator');
    const { LocaleProvider } = await import('@tests/support/intl');
    const id = pushActivity('relayAuth', 'relay.example', { operation: 'sign', description: 'relayAuth' });

    const view = render(<LocaleProvider initialLocale="pt"><ActivityIndicator /></LocaleProvider>);
    expect(screen.getByText('Autenticando com relay.example')).toBeInTheDocument();
    expect(screen.getByText('Autenticação NIP-42 com o relay')).toBeInTheDocument();
    view.unmount();

    const { dismissActivity } = await import('@/services/activity-log');
    dismissActivity(id);
    pushActivity('Legacy label', 'raw detail', { operation: 'connect' });
    render(<LocaleProvider initialLocale="en"><ActivityIndicator /></LocaleProvider>);
    expect(screen.getByText('Legacy label')).toBeInTheDocument();
    expect(screen.getByText('raw detail')).toBeInTheDocument();
  });
});
