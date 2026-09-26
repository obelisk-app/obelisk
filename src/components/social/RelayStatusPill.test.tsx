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

  it('renders the popover in a portal, not inside the header', () => {
    // Absolutely positioned in the header it painted underneath the bar:
    // the header and the surfaces below it are their own stacking contexts,
    // so a z-index on the panel only ranked it within the header.
    renderPill();
    fireEvent.click(screen.getByTestId('relay-status-pill'));
    const panel = screen.getByTestId('relay-status-popover');
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveStyle({ position: 'fixed' });
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

describe('which tier the button reports', () => {
  it('reports the active chat relay, not the social count, when asked', () => {
    // The chat header mounts this. Reporting the social tier there showed a
    // red 0/4 over a perfectly healthy chat, because a chat screen never
    // reads the social relays at all.
    mocks.statuses = {};
    mocks.access = 'ok';
    renderPill({ indicate: 'active', activeRelay: 'wss://chat.example' });
    const pill = screen.getByTestId('relay-status-pill');
    expect(pill).toHaveAttribute('data-indicate', 'active');
    expect(pill).toHaveAttribute('data-state', 'connected');
    // The misleading count is gone.
    expect(pill).not.toHaveTextContent('0/');
  });

  it('goes red only when the chat relay itself is refusing', () => {
    mocks.access = 'denied';
    renderPill({ indicate: 'active', activeRelay: 'wss://chat.example' });
    expect(screen.getByTestId('relay-status-pill')).toHaveAttribute('data-state', 'failed');
  });

  it('reads as connecting while the relay is still authenticating', () => {
    mocks.access = 'authenticating';
    renderPill({ indicate: 'active', activeRelay: 'wss://chat.example' });
    expect(screen.getByTestId('relay-status-pill')).toHaveAttribute('data-state', 'connecting');
  });

  it('falls back to the social summary when there is no active relay', () => {
    renderPill({ indicate: 'active' });
    const pill = screen.getByTestId('relay-status-pill');
    expect(pill).toHaveAttribute('data-indicate', 'social');
    expect(pill).toHaveTextContent('2/2');
  });

  it('still reports the social set on a social surface', () => {
    renderPill({ indicate: 'social', activeRelay: 'wss://chat.example' });
    const pill = screen.getByTestId('relay-status-pill');
    expect(pill).toHaveAttribute('data-indicate', 'social');
    expect(pill).toHaveTextContent('2/2');
  });

  it('still lists every social relay in the popover either way', () => {
    // The button narrows; the popover must not — "which one is down" is the
    // question behind the click.
    renderPill({ indicate: 'active', activeRelay: 'wss://chat.example' });
    fireEvent.click(screen.getByTestId('relay-status-pill'));
    expect(screen.getAllByTestId('relay-status-row')).toHaveLength(2);
    expect(screen.getByTestId('relay-status-active')).toBeInTheDocument();
  });
});
