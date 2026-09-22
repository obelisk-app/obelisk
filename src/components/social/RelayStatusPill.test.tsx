import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

const mocks = vi.hoisted(() => ({
  statuses: {} as Record<string, unknown>,
  watchRelays: vi.fn(),
  probeRelay: vi.fn(),
  access: 'ok' as string,
  connection: 'Connected',
}));

vi.mock('@/lib/social/relay-status', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/relay-status')>();
  return {
    ...actual,
    // The snapshot must be the same object each call — `useSyncExternalStore`
    // compares by identity, and a fresh one is an infinite render loop.
    getRelayStatuses: () => mocks.statuses,
    subscribeRelayStatus: () => () => {},
    watchRelays: mocks.watchRelays,
    probeRelay: mocks.probeRelay,
  };
});

vi.mock('@/lib/nostr-bridge', () => ({
  useConnectionState: () => mocks.connection,
  useRelayAccess: () => mocks.access,
}));

import RelayStatusPill from './RelayStatusPill';

const A = 'wss://a.example';
const B = 'wss://b.example';

const status = (url: string, over: Record<string, unknown> = {}) => ({
  url, state: 'connected', latencyMs: 42, notes: 7, lastChange: 0, ...over,
});

const renderPill = (props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <RelayStatusPill relays={[A, B]} {...props} />
  </LocaleProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.statuses = { [A]: status(A), [B]: status(B) };
  mocks.access = 'ok';
  mocks.connection = 'Connected';
});

describe('RelayStatusPill', () => {
  it('summarises the set at a glance', () => {
    renderPill();
    const pill = screen.getByTestId('relay-status-pill');
    expect(pill).toHaveAttribute('data-state', 'connected');
    expect(pill).toHaveTextContent('2/2');
  });

  it('starts the watcher, so status is live from mount', () => {
    // Previously nothing probed until you opened relay settings, which is
    // the one place you go *after* you already suspect something.
    renderPill();
    expect(mocks.watchRelays).toHaveBeenCalledWith([A, B]);
  });

  it('opens a per-relay breakdown with ping and delivered counts', () => {
    renderPill();
    fireEvent.click(screen.getByTestId('relay-status-pill'));
    const rows = screen.getAllByTestId('relay-status-row');
    expect(rows).toHaveLength(2);
    // Latency says it answers; the count says it's earning its slot.
    expect(rows[0]).toHaveTextContent('42ms');
    expect(rows[0]).toHaveTextContent('7');
  });

  it('shows the active relay connection and its NIP-42 state', () => {
    // "Connected" and "can actually read this relay's groups" are different
    // claims — a relay can be up and hand back nothing until AUTH lands.
    mocks.access = 'authenticating';
    renderPill({ activeRelay: 'wss://public.obelisk.ar' });
    fireEvent.click(screen.getByTestId('relay-status-pill'));

    expect(screen.getByTestId('relay-status-active')).toHaveAttribute('data-access', 'authenticating');
    expect(screen.getByTestId('relay-status-auth')).toHaveTextContent(/NIP-42/);
    expect(screen.getByTestId('relay-status-active')).toHaveTextContent('public.obelisk.ar');
  });

  it('names a rejected challenge rather than just showing a red dot', () => {
    mocks.access = 'auth-required';
    renderPill({ activeRelay: 'wss://public.obelisk.ar' });
    fireEvent.click(screen.getByTestId('relay-status-pill'));
    expect(screen.getByTestId('relay-status-auth')).toHaveTextContent(/Sign-in required/i);
  });

  it('offers a retry on the relay that failed', () => {
    mocks.statuses = { [A]: status(A, { state: 'failed', latencyMs: null }), [B]: status(B) };
    renderPill();
    fireEvent.click(screen.getByTestId('relay-status-pill'));

    fireEvent.click(screen.getByTestId('relay-retry'));
    expect(mocks.probeRelay).toHaveBeenCalledWith(A);
  });

  it('closes on Escape', () => {
    renderPill();
    fireEvent.click(screen.getByTestId('relay-status-pill'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('relay-status-popover')).not.toBeInTheDocument();
  });

  it('drops the count in compact mode but keeps the dot and the label', () => {
    renderPill({ compact: true });
    const pill = screen.getByTestId('relay-status-pill');
    expect(pill).not.toHaveTextContent('2/2');
    expect(pill).toHaveAttribute('aria-label', expect.stringContaining('2/2'));
  });
});
