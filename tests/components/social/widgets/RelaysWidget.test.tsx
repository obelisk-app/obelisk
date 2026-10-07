import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({
  statuses: {} as Record<string, unknown>,
  probeRelay: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('@/hooks/preferences/usePreferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://up.example', 'wss://down.example', 'wss://new.example'] }),
}));
vi.mock('@/services/social/relay-status', () => ({
  getRelayStatuses: () => mocks.statuses,
  subscribeRelayStatus: () => () => {},
  probeRelay: mocks.probeRelay,
}));
vi.mock('@/services/settings/open-settings', () => ({ openSettings: mocks.openSettings }));

import RelaysWidget from '@/components/social/widgets/RelaysWidget';

const row = (url: string, state: string, latencyMs: number | null) => ({ url, state, latencyMs, notes: 0, lastChange: 1 });

beforeEach(() => {
  mocks.statuses = {
    'wss://up.example': row('wss://up.example', 'connected', 85),
    'wss://down.example': row('wss://down.example', 'failed', null),
  };
  mocks.probeRelay.mockReset();
  mocks.openSettings.mockReset();
});

const renderWidget = () => render(<LocaleProvider initialLocale="en"><RelaysWidget /></LocaleProvider>);

describe('RelaysWidget', () => {
  it('lists every social relay with its state', () => {
    renderWidget();
    const rows = screen.getAllByTestId('widget-relay-row');
    expect(rows.map((r) => r.dataset.state)).toEqual(['connected', 'failed', 'unknown']);
    expect(rows[0]).toHaveTextContent('up.example');
    expect(rows[0]).toHaveTextContent('85ms');
    expect(rows[2].textContent).not.toMatch(/ms/);
  });

  it('offers a retry only on a failed relay, and probes it', () => {
    renderWidget();
    const rows = screen.getAllByTestId('widget-relay-row');
    expect(rows[0].querySelector('button')).toBeNull();
    fireEvent.click(rows[1].querySelector('button')!);
    expect(mocks.probeRelay).toHaveBeenCalledWith('wss://down.example');
  });

  it('opens the relay settings from the header', () => {
    renderWidget();
    fireEvent.click(screen.getByTestId('widget-relays-manage'));
    expect(mocks.openSettings).toHaveBeenCalledWith('relays');
  });
});
