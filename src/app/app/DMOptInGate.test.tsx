import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DM_OPT_IN_PREFERENCE_KEY, DM_OPT_IN_STORAGE_KEY, setDmOptInEnabled } from '@/lib/dm/opt-in';
import { DMOptInBoundary } from './DMOptInGate';

describe('DMOptInBoundary', () => {
  beforeEach(() => {
    localStorage.clear();
    setDmOptInEnabled(false);
  });

  it('shows the desktop DM opt-in gate by default and reveals DMs after enabling', async () => {
    render(
      <DMOptInBoundary surface="desktop">
        <div data-testid="normal-dms">Normal DMs</div>
      </DMOptInBoundary>,
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
      <DMOptInBoundary surface="mobile" secondaryLabel="Back" onSecondary={onSecondary}>
        <div data-testid="mobile-dms">Mobile DMs</div>
      </DMOptInBoundary>,
    );

    expect(screen.getByTestId('dm-opt-in-gate-mobile')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-dms')).toBeNull();

    fireEvent.click(screen.getByText('Back'));
    expect(onSecondary).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('enable-dms-button'));
    await waitFor(() => expect(screen.getByTestId('mobile-dms')).toBeInTheDocument());
  });
});
