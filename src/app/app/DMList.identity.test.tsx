/**
 * Who a DM row says you are talking to.
 *
 * The DM surfaces resolved peers through the bridge's `useUserMetadata`,
 * which only queries the group/profile-lookup relay tier — lacrypta,
 * public.obelisk.ar, purplepag.es. Those hold kind 0 for people in your
 * NIP-29 rooms. A DM peer is usually someone from the wider network with no
 * reason to have published there, so every row rendered a petname and a
 * letter avatar while the *same person* showed a real name and picture in
 * the feed, which resolves over the social tier.
 *
 * `useAuthor` merges both tiers, so these pin that the DM list reads it and
 * batches the lookup rather than firing one REQ per row.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import type { JsDirectMessage } from '@/lib/nostr-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

const mocks = vi.hoisted(() => ({
  dms: {} as Record<string, JsDirectMessage[]>,
  follows: [] as string[],
  ensureSocialProfiles: vi.fn(),
  // Only the social tier knows these two — exactly the case that was broken.
  social: {
    ['a'.repeat(64)]: { displayName: 'Alice From Nostr', picture: 'https://img.example/a.png' },
    ['b'.repeat(64)]: { displayName: 'Bob From Nostr', picture: null },
  } as Record<string, { displayName: string; picture: string | null }>,
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useDirectMessages: () => mocks.dms,
  useMyFollows: () => mocks.follows,
  // The group tier knows nobody here, which is the whole point.
  useUserMetadata: () => null,
  nostrActions: { ensureUserMetadata: vi.fn() },
}));

vi.mock('@/lib/social/profiles', () => ({
  ensureSocialProfiles: mocks.ensureSocialProfiles,
  useSocialProfile: (pubkey: string | null) => (pubkey ? mocks.social[pubkey] ?? null : null),
}));

vi.mock('@/lib/read-state/selectors', () => ({ useDMUnreadCount: () => 0 }));
vi.mock('./DMComposer', () => ({ default: () => <div /> }));

import DMList from './DMList';

const dm = (peer: string, content: string): JsDirectMessage => ({
  id: `${peer}-1`,
  counterparty: peer,
  content,
  createdAt: 1000,
  outgoing: false,
} as JsDirectMessage);

const renderList = () => render(
  <LocaleProvider initialLocale="en">
    <DMList activePeer={null} onPick={() => {}} />
  </LocaleProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dms = { [ALICE]: [dm(ALICE, 'hey')], [BOB]: [dm(BOB, 'yo')] };
  mocks.follows = [];
});

describe('DM list identity', () => {
  it('shows the name the social tier knows, not a fallback', async () => {
    renderList();
    await waitFor(() => expect(screen.getByText('Alice From Nostr')).toBeInTheDocument());
    expect(screen.getByText('Bob From Nostr')).toBeInTheDocument();
  });

  it('never renders a raw hex pubkey as the name', async () => {
    renderList();
    await waitFor(() => expect(screen.getByText('Alice From Nostr')).toBeInTheDocument());
    expect(screen.queryByText(new RegExp(ALICE.slice(0, 10)))).not.toBeInTheDocument();
  });

  it('resolves every peer in one batched request, not one per row', async () => {
    renderList();
    await waitFor(() => expect(mocks.ensureSocialProfiles).toHaveBeenCalled());
    const batched = mocks.ensureSocialProfiles.mock.calls.find(
      (call) => Array.isArray(call[0]) && call[0].length === 2,
    );
    expect(batched).toBeTruthy();
    expect(batched![0]).toEqual(expect.arrayContaining([ALICE, BOB]));
  });

  it('does not re-request on an unrelated re-render', async () => {
    const { rerender } = renderList();
    await waitFor(() => expect(mocks.ensureSocialProfiles).toHaveBeenCalled());
    const before = mocks.ensureSocialProfiles.mock.calls.length;
    rerender(
      <LocaleProvider initialLocale="en">
        <DMList activePeer={ALICE} onPick={() => {}} />
      </LocaleProvider>,
    );
    expect(mocks.ensureSocialProfiles.mock.calls.length).toBe(before);
  });
});
