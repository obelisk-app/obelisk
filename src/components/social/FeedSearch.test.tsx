import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const mocks = vi.hoisted(() => ({
  searchNotes: vi.fn(),
  searchHashtag: vi.fn(),
  userSearch: {
    directHit: null as unknown,
    nip05Hit: null as unknown,
    nostrResults: [] as unknown[],
    loading: false,
  },
}));

vi.mock('@/lib/social/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/search')>();
  return { ...actual, searchNotes: mocks.searchNotes, searchHashtag: mocks.searchHashtag };
});

vi.mock('@/lib/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: () => mocks.userSearch,
}));

vi.mock('@/lib/social/profiles', () => ({
  ensureSocialProfiles: vi.fn().mockResolvedValue(undefined),
  useSocialProfile: () => null,
}));

vi.mock('@/lib/nostr-bridge', () => ({
  getBridge: async () => ({ publishEvent: vi.fn() }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
  useUserMetadata: () => null,
  useMyPubkey: () => 'b'.repeat(64),
  useMyFollows: () => [] as string[],
  useMyContactList: () => null,
  useMyContactListReady: () => true,
  useCurrentRelayUrl: () => 'wss://relay.example',
}));

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: vi.fn().mockResolvedValue(undefined),
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import FeedSearch from './FeedSearch';

const AUTHOR = 'a'.repeat(64);

const note = (over: Partial<NostrEvent>): NostrEvent => ({
  id: 'n1',
  pubkey: AUTHOR,
  kind: 1,
  content: 'zaps over lightning',
  created_at: 1_700_000_000,
  tags: [],
  sig: '',
  ...over,
});

const renderSearch = (props: Record<string, unknown> = {}) => render(
  <LocaleProvider initialLocale="en">
    <FeedSearch {...props} />
  </LocaleProvider>,
);

const type = (value: string) => fireEvent.change(
  screen.getByTestId('feed-search-input'),
  { target: { value } },
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  mocks.searchNotes.mockResolvedValue([]);
  mocks.searchHashtag.mockResolvedValue([]);
  mocks.userSearch = { directHit: null, nip05Hit: null, nostrResults: [], loading: false };
});

describe('FeedSearch', () => {
  it('shows a hint and searches nothing until something is typed', () => {
    renderSearch();
    expect(screen.getByTestId('feed-search-hint')).toBeInTheDocument();
    expect(mocks.searchNotes).not.toHaveBeenCalled();
  });

  it('debounces, then runs a full-text search', async () => {
    renderSearch();
    type('light');
    type('lightning');
    expect(mocks.searchNotes).not.toHaveBeenCalled();

    // One query for the settled value, not one per keystroke.
    await waitFor(() => expect(mocks.searchNotes).toHaveBeenCalledTimes(1));
    expect(mocks.searchNotes).toHaveBeenCalledWith('lightning');
  });

  it('routes a #tag to the tag search, which every relay can answer', async () => {
    renderSearch();
    type('#coffee');

    await waitFor(() => expect(mocks.searchHashtag).toHaveBeenCalledWith('coffee'));
    expect(mocks.searchNotes).not.toHaveBeenCalled();
  });

  it('does not full-text search a pasted identifier', async () => {
    // A bech32 string will never match a full-text index; the people section
    // resolves it instead.
    renderSearch();
    type('npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9');
    await vi.advanceTimersByTimeAsync(400);

    expect(mocks.searchNotes).not.toHaveBeenCalled();
  });

  it('renders posts and the hashtags they carry', async () => {
    mocks.searchNotes.mockResolvedValue([
      note({ id: 'n1', tags: [['t', 'lightning']] }),
    ]);
    renderSearch();
    type('lightning');

    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(screen.getByTestId('search-posts')).toBeInTheDocument());
    expect(screen.getByTestId('search-tags')).toHaveTextContent('#lightning');
  });

  it('lists people and opens a profile on click', async () => {
    mocks.userSearch = {
      directHit: { pubkey: AUTHOR, displayName: 'Alice', picture: null, nip05: 'alice@example.com' },
      nip05Hit: null,
      nostrResults: [],
      loading: false,
    };
    const onOpenProfile = vi.fn();
    renderSearch({ onOpenProfile });
    type('alice');
    await vi.advanceTimersByTimeAsync(400);

    const row = await screen.findByTestId('search-person');
    expect(row).toHaveTextContent('Alice');
    fireEvent.click(row);
    expect(onOpenProfile).toHaveBeenCalledWith(AUTHOR);
  });

  it('dedupes a person returned by more than one lookup path', async () => {
    const hit = { pubkey: AUTHOR, displayName: 'Alice', picture: null, nip05: null };
    mocks.userSearch = { directHit: hit, nip05Hit: hit, nostrResults: [hit], loading: false };
    renderSearch();
    type('alice');
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findAllByTestId('search-person')).toHaveLength(1);
  });

  it('says so when nothing matched', async () => {
    renderSearch();
    type('qwertyuiop');
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(screen.getByTestId('feed-search-empty')).toBeInTheDocument());
  });

  it('closes when asked', () => {
    const onClose = vi.fn();
    renderSearch({ onClose });
    fireEvent.click(screen.getByTestId('feed-search-close'));
    expect(onClose).toHaveBeenCalled();
  });
});
