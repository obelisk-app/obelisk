import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import { DM_OPT_IN_PREFERENCE_KEY, DM_OPT_IN_STORAGE_KEY } from '@/constants/chat/dm';
import { LocaleProvider } from '@tests/support/intl';
import { DMOptInBoundary } from '@/app/[locale]/app/dm/DmOptInBoundary';

describe('DMOptInBoundary', () => {
  beforeEach(() => {
    localStorage.clear();
    setDmOptInEnabled(false);
  });

  it('shows the desktop DM opt-in gate by default and reveals DMs after enabling', async () => {
    render(
      <LocaleProvider initialLocale="en">
        <DMOptInBoundary surface="desktop">
          <div data-testid="normal-dms">Normal DMs</div>
        </DMOptInBoundary>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('dm-opt-in-gate-desktop')).toBeInTheDocument();
    expect(screen.getByText('Turn on direct messages')).toBeInTheDocument();
    expect(screen.getByText(/Nostr encrypted direct-message events/i)).toBeInTheDocument();
    expect(screen.queryByTestId('normal-dms')).toBeNull();

    fireEvent.click(screen.getByTestId('enable-dms-button'));

    await waitFor(() => expect(screen.getByTestId('normal-dms')).toBeInTheDocument());
    const stored = JSON.parse(localStorage.getItem(DM_OPT_IN_STORAGE_KEY) ?? '{}');
    expect(stored[DM_OPT_IN_PREFERENCE_KEY]).toBe(true);
  });

  it('shows the mobile DM opt-in gate by default and reveals DMs after enabling', async () => {
    const onSecondary = vi.fn();

    render(
      <LocaleProvider initialLocale="en">
        <DMOptInBoundary surface="mobile" secondaryLabel="Back" onSecondary={onSecondary}>
          <div data-testid="mobile-dms">Mobile DMs</div>
        </DMOptInBoundary>
      </LocaleProvider>,
    );

    expect(screen.getByTestId('dm-opt-in-gate-mobile')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-dms')).toBeNull();

    fireEvent.click(screen.getByText('Back'));
    expect(onSecondary).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('enable-dms-button'));
    await waitFor(() => expect(screen.getByTestId('mobile-dms')).toBeInTheDocument());
  });

  it('renders the opt-in copy from the configured language', () => {
    render(
      <LocaleProvider initialLocale="es">
        <DMOptInBoundary surface="desktop">
          <div data-testid="normal-dms">Normal DMs</div>
        </DMOptInBoundary>
      </LocaleProvider>,
    );

    expect(screen.getByText('Activar mensajes directos')).toBeInTheDocument();
    expect(screen.getByText(/eventos de mensajes directos encriptados/i)).toBeInTheDocument();
    expect(screen.getByTestId('enable-dms-button')).toHaveTextContent('Activar DMs');
  });
});

describe('DmOptInGate', () => {
  beforeEach(() => {
    localStorage.clear();
    setDmOptInEnabled(false);
  });

  it('turns DMs on and tells the host, and labels the way out "Not now" by default', async () => {
    const { default: DmOptInGate } = await import('@/app/[locale]/app/dm/DmOptInGate');
    const onEnable = vi.fn();
    const onSecondary = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <DmOptInGate surface="sidebar" onEnable={onEnable} onSecondary={onSecondary} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('dm-opt-in-gate-sidebar')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Not now'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('enable-dms-button'));
    expect(onEnable).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(DM_OPT_IN_STORAGE_KEY) ?? '{}');
    expect(stored[DM_OPT_IN_PREFERENCE_KEY]).toBe(true);
  });

  it('offers no way out when the host gives none', async () => {
    const { default: DmOptInGate } = await import('@/app/[locale]/app/dm/DmOptInGate');
    render(<LocaleProvider initialLocale="en"><DmOptInGate /></LocaleProvider>);
    expect(screen.getByTestId('dm-opt-in-gate-desktop')).toBeInTheDocument();
    expect(screen.queryByText('Not now')).toBeNull();
  });
});
