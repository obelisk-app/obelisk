import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

// The snapshot must be the SAME object each call: `useSyncExternalStore`
// compares by identity, and a fresh one per call is an infinite loop rather
// than a slow render. The real store caches for this reason.
const EMPTY_STATUSES = {};

vi.mock('@/lib/social/relay-status', () => ({
  subscribeRelayStatus: () => () => {},
  getRelayStatuses: () => EMPTY_STATUSES,
  watchRelays: vi.fn(),
  relayStatusSummary: () => ({ total: 2, connected: 2, state: 'connected' }),
}));

import TrendingPanel from './TrendingPanel';

const note = (id: string, pubkey: string, tags: string[]): NostrEvent => ({
  id,
  pubkey,
  kind: 1,
  content: '',
  created_at: 1,
  sig: '',
  tags: tags.map((tag) => ['t', tag]),
});

const renderPanel = (notes: NostrEvent[], props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <TrendingPanel notes={notes} relays={['wss://a', 'wss://b']} {...props} />
  </LocaleProvider>,
);

describe('TrendingPanel', () => {
  it('lists what the loaded feed is about', () => {
    renderPanel([note('1', 'a', ['bitcoin']), note('2', 'b', ['bitcoin'])]);
    expect(screen.getByTestId('trending-tag')).toHaveTextContent('#bitcoin');
  });

  it('searches the tag when one is clicked', () => {
    const onOpenTag = vi.fn();
    renderPanel([note('1', 'a', ['art'])], { onOpenTag });
    fireEvent.click(screen.getByTestId('trending-tag'));
    expect(onOpenTag).toHaveBeenCalledWith('art');
  });

  it('says so rather than rendering an empty box', () => {
    renderPanel([note('1', 'a', [])]);
    expect(screen.getByTestId('feed-trending-empty')).toBeInTheDocument();
  });

  it('shows relay connectivity, which used to live only in settings', () => {
    renderPanel([]);
    expect(screen.getByTestId('relay-status-pill')).toHaveAttribute('data-state', 'connected');
  });
});
