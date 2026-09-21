import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

/**
 * These used to mock `SimplePool` directly, because the component opened its
 * own pool in a mount effect. It doesn't any more — reads go through the
 * shared social core — so the seam moved to `@/lib/social/feed` and
 * `@/lib/social/pool`, which is also where it belongs: the test now asserts
 * what the component asks for, not which socket library it happens to use.
 */

const socialMocks = vi.hoisted(() => ({
  profileNotes: [] as NostrEvent[],
  loadProfileFeed: vi.fn(),
  subscribeSocial: vi.fn(() => () => {}),
  publishNote: vi.fn(),
  publishReply: vi.fn(),
  publishReaction: vi.fn(),
  publishRepost: vi.fn(),
  ensureCounts: vi.fn().mockResolvedValue(undefined),
}));

const bridgeMocks = vi.hoisted(() => ({
  ensureUserMetadata: vi.fn().mockResolvedValue(undefined),
  publishEvent: vi.fn(),
  myPubkey: 'b'.repeat(64),
  contactEvent: null as NostrEvent | null,
  contactsReady: true,
  metadata: null as Record<string, string> | null,
}));

vi.mock('@/lib/social/pool', () => ({
  subscribeSocial: socialMocks.subscribeSocial,
  querySocial: vi.fn().mockResolvedValue([]),
  socialRelays: () => ['wss://one.example'],
  applySocialRelays: vi.fn(),
  initSocial: vi.fn(),
  importNip65Relays: vi.fn().mockResolvedValue([]),
  SOCIAL_SDK_CACHE_NAMESPACE: 'obelisk-social-sdk/',
  // The relay-status watcher the toolbar pill starts reads these.
  poolEvents: {},
  socialPool: () => ({
    listConnectionStatus: () => new Map(),
    ensureRelay: vi.fn().mockResolvedValue({ connected: true, onclose: () => {} }),
    seenOn: new Map(),
  }),
}));

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: socialMocks.ensureCounts,
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

vi.mock('@/lib/social/publish', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/publish')>();
  return {
    ...actual,
    publishNote: socialMocks.publishNote,
    publishReply: socialMocks.publishReply,
    publishReaction: socialMocks.publishReaction,
    publishRepost: socialMocks.publishRepost,
  };
});

vi.mock('@/lib/social/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/feed')>();
  return {
    ...actual,
    loadProfileFeed: socialMocks.loadProfileFeed,
    loadFollowingFeed: vi.fn().mockResolvedValue([]),
    loadGlobalFeed: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/lib/nostr-bridge', () => ({
  getBridge: async () => ({ publishEvent: bridgeMocks.publishEvent }),
  nostrActions: { ensureUserMetadata: bridgeMocks.ensureUserMetadata },
  useCurrentRelayUrl: () => 'wss://relay.example',
  useMyPubkey: () => bridgeMocks.myPubkey,
  useMyContactList: () => bridgeMocks.contactEvent,
  useMyContactListReady: () => bridgeMocks.contactsReady,
  useMyFollows: () => [],
  useUserMetadata: () => bridgeMocks.metadata ?? {
    displayName: 'Alice',
    name: 'alice',
    picture: 'https://example.com/avatar.jpg',
    banner: 'https://example.com/banner.jpg',
    nip05: 'alice@example.com',
    about: 'hello from nostr',
  },
}));

vi.mock('./MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import NostrProfile from './NostrProfile';
import { flushFeedCacheWrites } from '@/lib/social/cache';

const AUTHOR = 'a'.repeat(64);

const note = (id: string, content: string, tags: string[][] = [], createdAt = 1000): NostrEvent => ({
  id,
  pubkey: AUTHOR,
  content,
  created_at: createdAt,
  tags,
  kind: 1,
  sig: '',
});

function renderProfile(props: Partial<React.ComponentProps<typeof NostrProfile>> = {}) {
  return render(
    <LocaleProvider>
      <NostrProfile pubkey={AUTHOR} onClose={props.onClose ?? vi.fn()} {...props} />
    </LocaleProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  bridgeMocks.metadata = null;
  socialMocks.loadProfileFeed.mockResolvedValue([]);
  socialMocks.subscribeSocial.mockReturnValue(() => {});
  bridgeMocks.myPubkey = 'b'.repeat(64);
  bridgeMocks.contactEvent = null;
  bridgeMocks.contactsReady = true;
});

describe('NostrProfile', () => {
  it('loads the author feed through the shared social core, not its own pool', async () => {
    renderProfile();
    await waitFor(() => expect(socialMocks.loadProfileFeed).toHaveBeenCalled());
    expect(socialMocks.loadProfileFeed.mock.calls[0][0]).toBe(AUTHOR);
  });

  it('separates posts, replies and media across the tabs', async () => {
    socialMocks.loadProfileFeed.mockResolvedValue([
      note('post', 'a plain post'),
      note('reply', 'a reply', [['e', 'parent', '', 'root', AUTHOR]]),
      note('img', 'https://example.com/photo.jpg'),
    ]);
    renderProfile();

    await waitFor(() => expect(screen.getByText('a plain post')).toBeInTheDocument());
    // A reply must not show under Posts.
    expect(screen.queryByText('a reply')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('profile-tab-replies'));
    await waitFor(() => expect(screen.getByText('a reply')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('profile-tab-media'));
    await waitFor(() => expect(screen.getByTestId('profile-media-grid')).toBeInTheDocument());
  });

  it('paints cached notes on the next mount instead of refetching from empty', async () => {
    // The regression this guards: the component used to be keyed
    // `${pubkey}:${relays}` and kept notes in useState, so any navigation
    // threw them away and showed skeletons again.
    socialMocks.loadProfileFeed.mockResolvedValue([note('cached', 'from the relay')]);
    const first = renderProfile();
    await waitFor(() => expect(screen.getByText('from the relay')).toBeInTheDocument());
    // Cache writes are debounced so a streaming feed doesn't re-serialize on
    // every arrival; force it out before we tear the component down.
    flushFeedCacheWrites();
    first.unmount();

    // Second mount: the relay is slow/unavailable, but the cache carries it.
    socialMocks.loadProfileFeed.mockImplementation(() => new Promise(() => {}));
    renderProfile();
    await waitFor(() => expect(screen.getByText('from the relay')).toBeInTheDocument());
  });

  it('publishes follow changes as kind 3 without dropping unrelated tags', async () => {
    bridgeMocks.contactEvent = {
      ...note('contacts', ''),
      kind: 3,
      tags: [['p', 'existing'], ['relay', 'wss://legacy.example']],
    };
    bridgeMocks.publishEvent.mockResolvedValue(note('published', ''));
    renderProfile();

    fireEvent.click(screen.getByTestId('profile-follow-button'));
    await waitFor(() => expect(bridgeMocks.publishEvent).toHaveBeenCalled());

    const [template, opts] = bridgeMocks.publishEvent.mock.calls[0];
    expect(template.kind).toBe(3);
    expect(template.tags).toContainEqual(['relay', 'wss://legacy.example']);
    expect(template.tags).toContainEqual(['p', AUTHOR]);
    // Social writes must not leak onto the active NIP-29 group relay.
    expect(opts.mode).toBe('replace');
  });

  it('shows copy, share, mute and block actions in the profile menu', () => {
    renderProfile();
    fireEvent.click(screen.getByTestId('profile-more-button'));
    expect(screen.getByText('Copy npub')).toBeInTheDocument();
    expect(screen.getByText('Mute user')).toBeInTheDocument();
    expect(screen.getByText('Block user')).toBeInTheDocument();
    expect(screen.getByText('Share profile')).toBeInTheDocument();
  });

  it('embeds the shared owner profile cleanly in mobile settings', () => {
    bridgeMocks.myPubkey = AUTHOR;
    const onEditProfile = vi.fn();
    renderProfile({ settingsMode: true, onEditProfile });

    // Settings mode hides the explore chrome and offers profile editing.
    expect(screen.queryByTestId('profile-explore-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('copy-npub')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-profile-btn'));
    expect(onEditProfile).toHaveBeenCalled();
  });

  it('leaves no empty action strip on your own profile in settings', () => {
    // The row that carries follow/message/⋯ has nothing to carry here, and
    // rendering it anyway left a band of black that read as a broken layout.
    bridgeMocks.myPubkey = AUTHOR;
    renderProfile({ settingsMode: true, onEditProfile: vi.fn() });
    expect(screen.queryByTestId('profile-more-button')).not.toBeInTheDocument();
  });

  it('offers preferences as a gear beside the avatar', () => {
    // The Perfil/Preferencias tab pair sat above a screen that is obviously
    // your profile; one gear where a phone expects it replaces it.
    bridgeMocks.myPubkey = AUTHOR;
    const onOpenSettings = vi.fn();
    renderProfile({ settingsMode: true, mobile: true, onOpenSettings });

    fireEvent.click(screen.getByTestId('profile-settings-gear'));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it('composes full-screen on a phone', async () => {
    bridgeMocks.myPubkey = AUTHOR;
    renderProfile({ mobile: true });
    // No inline row: it promised an input and delivered a link to one.
    expect(screen.queryByTestId('feed-compose')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('profile-create-post'));
    expect(await screen.findByTestId('mobile-composer')).toBeInTheDocument();
  });

  it('links the website and the URLs inside the bio', () => {
    bridgeMocks.metadata = {
      displayName: 'Alice',
      about: 'writing at https://alice.example',
      website: 'alice.example',
    };
    renderProfile();

    expect(screen.getByTestId('profile-bio-link')).toHaveAttribute('href', 'https://alice.example');
    // A bare host in `website` would otherwise resolve against our own origin.
    expect(screen.getByTestId('profile-website')).toHaveAttribute('href', 'https://alice.example');
  });

  it('renders the feed tabs as a segmented pill', () => {
    // Every other switch in Obelisk is a pill; three underlines stretched
    // across a phone read as another app's chrome.
    renderProfile();
    const tab = screen.getByTestId('profile-tab-posts');
    expect(tab.className).toContain('lc-segment-item');
    expect(tab.closest('.lc-segment')).not.toBeNull();
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  it('lets the owner compose a post and closes from the desktop X', async () => {
    bridgeMocks.myPubkey = AUTHOR;
    socialMocks.publishNote.mockResolvedValue(note('new', 'hello world'));
    const onClose = vi.fn();
    renderProfile({ onClose });

    fireEvent.click(screen.getByTestId('profile-create-post'));
    fireEvent.change(screen.getByTestId('composer-input'), { target: { value: 'hello world' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(socialMocks.publishNote).toHaveBeenCalled());
    expect(socialMocks.publishNote.mock.calls[0][0]).toBe('hello world');

    fireEvent.click(screen.getByTestId('profile-explore-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('opens a reply composer targeting the note that was replied to', async () => {
    socialMocks.loadProfileFeed.mockResolvedValue([note('post', 'reply to me')]);
    renderProfile();
    await waitFor(() => expect(screen.getByText('reply to me')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('note-reply'));
    expect(screen.getByTestId('composer-input')).toBeInTheDocument();
  });
});
