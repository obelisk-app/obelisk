vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  const { userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  const readProfile: typeof import('@/services/nostr-bridge')['useUserMetadata'] = (pubkey) => userMetadataFixture({
      displayName: pubkey === keys.reposter ? 'Gigi' : 'Original Author',
    });
  return sessionMock({
    useMyPubkey: () => 'me'.padEnd(64, '0'),
    useSessionProfile: () => readProfile((() => 'me'.padEnd(64, '0'))()),
  });
});
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

// Hoisted: vi.mock factories run before module-level consts exist.
const mocks = vi.hoisted(() => ({
  publishReaction: vi.fn().mockResolvedValue({}),
  publishRepost: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/services/social/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/publish')>()),
  publishReaction: mocks.publishReaction,
  publishRepost: mocks.publishRepost,
  publishDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/services/social/engagement', () => ({
  ensureCounts: vi.fn(),
  getCounts: () => ({ reactionCount: 4, repostCount: 2, zapTotalSats: 0, replyCount: 1 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

// Real keys: the embedded note is signature-verified before it renders, so
// the fixtures have to be genuinely signed. Hoisted so the bridge mock can
// name people by pubkey; filled in below once nostr-tools is imported.
const keys = vi.hoisted(() => ({ author: '', reposter: '' }));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({

    useMyFollows: () => [keys.author],
    useCurrentRelayUrl: () => 'wss://relay.example',
    useUserMetadata: (pubkey) => userMetadataFixture({
      displayName: pubkey === keys.reposter ? 'Gigi' : 'Original Author',
    }),
    nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
  });
});

vi.mock('@/components/chat/message/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import NoteCard from '@/components/social/note/NoteCard';

const AUTHOR_SK = new Uint8Array(32).fill(1);
const REPOSTER_SK = new Uint8Array(32).fill(2);
keys.author = getPublicKey(AUTHOR_SK);
keys.reposter = getPublicKey(REPOSTER_SK);

const ORIGINAL: NostrEvent = finalizeEvent({
  content: 'the original note',
  created_at: 1000,
  tags: [],
  kind: 1,
}, AUTHOR_SK);

const REPOST: NostrEvent = finalizeEvent({
  content: JSON.stringify(ORIGINAL),
  created_at: 2000,
  tags: [['e', ORIGINAL.id], ['p', ORIGINAL.pubkey]],
  kind: 6,
}, REPOSTER_SK);

const renderRepost = (props = {}) => render(
  <LocaleProvider initialLocale="en"><NoteCard note={REPOST} {...props} /></LocaleProvider>,
);

beforeEach(() => {
  mocks.publishReaction.mockClear();
  mocks.publishRepost.mockClear();
});

describe('repost rendering', () => {
  it('attributes the repost legibly rather than in tiny muted text', () => {
    // It was 11px muted with a `⇄` glyph that rendered at a different weight
    // than the SVG icons beside it: easy to miss entirely.
    renderRepost();
    const attribution = screen.getByTestId('repost-attribution');
    expect(attribution).toHaveTextContent('Gigi');
    expect(attribution).toHaveTextContent('reposted');
    expect(attribution.className).toContain('text-[13px]');
    // An SVG icon, not a unicode glyph.
    expect(attribution.querySelector('svg')).toBeInTheDocument();
    expect(attribution.textContent).not.toContain('⇄');
  });

  it('opens the reposter profile from their name', () => {
    const onOpenProfile = vi.fn();
    renderRepost({ onOpenProfile });
    fireEvent.click(screen.getByRole('button', { name: 'Gigi' }));
    expect(onOpenProfile).toHaveBeenCalledWith(REPOST.pubkey);
  });

  it('names several reposters and counts the rest', () => {
    // Previously duplicates were discarded outright, so eight people
    // reposting rendered as one anonymous row: the count is the only
    // signal a repost actually carries.
    const others = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64)];
    renderRepost({ reposters: [REPOST.pubkey, ...others] });
    const attribution = screen.getByTestId('repost-attribution');
    expect(attribution).toHaveTextContent('Gigi');
    // Two names then a number: three is already too wide for a feed row.
    expect(screen.getByTestId('repost-others')).toHaveTextContent('3 others');
  });

  it('shows no count when only one person reposted', () => {
    renderRepost({ reposters: [REPOST.pubkey] });
    expect(screen.queryByTestId('repost-others')).not.toBeInTheDocument();
  });

  it('gives the reposted note a full action row', () => {
    // The regression: `embedded` suppressed actions, so you could not reply
    // to, like or zap the note someone had reposted.
    renderRepost();
    expect(screen.getByTestId('note-reply')).toBeInTheDocument();
    expect(screen.getByTestId('note-repost')).toBeInTheDocument();
    expect(screen.getByTestId('note-react')).toBeInTheDocument();
    expect(screen.getByTestId('note-zap')).toBeInTheDocument();
  });

  it('acts on the ORIGINAL note, not the repost wrapper', () => {
    // Liking a repost has to like the note that was reposted: otherwise the
    // count lands on a kind-6 wrapper nobody reads.
    renderRepost();
    fireEvent.click(screen.getByTestId('note-react'));
    expect(mocks.publishReaction).toHaveBeenCalledWith(
      expect.objectContaining({ id: ORIGINAL.id, pubkey: ORIGINAL.pubkey }),
    );
  });

  it('replies to the original note', () => {
    const onReply = vi.fn();
    renderRepost({ onReply });
    fireEvent.click(screen.getByTestId('note-reply'));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: ORIGINAL.id }));
  });

  it('shows the original content and author, not raw repost JSON', () => {
    renderRepost();
    expect(screen.getByText('the original note')).toBeInTheDocument();
    expect(screen.getByText('Original Author')).toBeInTheDocument();
    expect(screen.queryByText(/"kind":1/)).not.toBeInTheDocument();
  });

  it('marks authors you follow, so Global is distinguishable from Following', () => {
    // Every author looked identical, so there was no way to tell whose voice
    // you chose and whose the relay handed you. ORIGINAL's pubkey is in the
    // mocked follow list; the reposter's is not.
    renderRepost();
    expect(screen.getByTestId('note-following-badge')).toHaveTextContent('Following');
  });

  it('does not double the row padding when nesting the original', () => {
    const { container } = renderRepost();
    // The attribution wrapper supplies px-5 py-4; the nested card must not
    // add its own or the repost sits visibly indented from its neighbours.
    const inner = container.querySelector('[data-testid="note-card"]');
    expect(inner?.className).not.toContain('px-5');
  });
});

describe('opening the note that was reposted', () => {
  it('opens the original when the repost body is clicked', () => {
    // The inner card rendered with `nested`, which stripped both the card
    // click and the timestamp control, so a reposted note was the one row
    // in the feed you could not open.
    const onOpenNote = vi.fn();
    renderRepost({ onOpenNote });
    fireEvent.click(screen.getByText('the original note'));
    expect(onOpenNote).toHaveBeenCalledWith(ORIGINAL.id);
  });

  it('opens it exactly once: the wrapper owns the click, not both cards', () => {
    const onOpenNote = vi.fn();
    renderRepost({ onOpenNote });
    fireEvent.click(screen.getByText('the original note'));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
  });

  it('marks the row as openable so it gets the affordance', () => {
    renderRepost({ onOpenNote: vi.fn() });
    expect(screen.getByTestId('repost-card').className).toContain('note-card-open');
  });

  it('gives the reposted note a keyboard route via its timestamp', () => {
    const onOpenNote = vi.fn();
    renderRepost({ onOpenNote });
    fireEvent.click(screen.getByTestId('note-open-thread'));
    expect(onOpenNote).toHaveBeenCalledWith(ORIGINAL.id);
    expect(onOpenNote).toHaveBeenCalledTimes(1);
  });

  it('still opens the reposter profile without opening the thread', () => {
    const onOpenNote = vi.fn();
    const onOpenProfile = vi.fn();
    renderRepost({ onOpenNote, onOpenProfile });
    fireEvent.click(screen.getByRole('button', { name: 'Gigi' }));
    expect(onOpenProfile).toHaveBeenCalledWith(REPOST.pubkey);
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it('is inert when the host gave it nowhere to go', () => {
    renderRepost();
    expect(screen.getByTestId('repost-card').className).not.toContain('note-card-open');
  });
});

describe('a forged embedded note', () => {
  // The impersonation case from the round-2 security audit: a kind 6 whose
  // `content` is hand-written JSON attributed to someone else's pubkey. The
  // wrapper itself is pool-verified (the attacker signed it); the inner blob
  // never crossed a subscription and used to render as that person's note.
  const FORGED_INNER: NostrEvent = {
    ...ORIGINAL,
    content: 'send your sats to this address',
    // Keep the real id and sig; the text no longer hashes to the id.
  };
  const FORGED_REPOST: NostrEvent = finalizeEvent({
    content: JSON.stringify(FORGED_INNER),
    created_at: 2000,
    tags: [['e', ORIGINAL.id], ['p', ORIGINAL.pubkey]],
    kind: 6,
  }, REPOSTER_SK);

  const renderForged = (props = {}) => render(
    <LocaleProvider initialLocale="en"><NoteCard note={FORGED_REPOST} {...props} /></LocaleProvider>,
  );

  it('is not rendered as a note card attributed to the claimed author', () => {
    renderForged();
    expect(screen.queryByText('send your sats to this address')).not.toBeInTheDocument();
    expect(screen.queryByText('Original Author')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-card')).not.toBeInTheDocument();
  });

  it('gets no action row, so a reader cannot like or zap the forgery', () => {
    renderForged();
    expect(screen.queryByTestId('note-react')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-zap')).not.toBeInTheDocument();
    expect(screen.queryByTestId('note-reply')).not.toBeInTheDocument();
  });

  it('falls back to opening the real note the e tag names', () => {
    // Same path an empty-content repost takes: the thread view fetches by
    // id through the pool, which verifies what it gets.
    const onOpenNote = vi.fn();
    renderForged({ onOpenNote });
    fireEvent.click(screen.getByRole('button', { name: 'Open the reposted note' }));
    expect(onOpenNote).toHaveBeenCalledWith(ORIGINAL.id);
  });

  it('still attributes the repost itself to the reposter', () => {
    // The wrapper is genuine; only its payload is not.
    renderForged();
    expect(screen.getByTestId('repost-attribution')).toHaveTextContent('Gigi');
  });
});
