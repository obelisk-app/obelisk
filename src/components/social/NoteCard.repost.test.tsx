import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

// Hoisted: vi.mock factories run before module-level consts exist.
const mocks = vi.hoisted(() => ({
  publishReaction: vi.fn().mockResolvedValue({}),
  publishRepost: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/social/publish', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/publish')>()),
  publishReaction: mocks.publishReaction,
  publishRepost: mocks.publishRepost,
  publishDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: vi.fn(),
  getCounts: () => ({ reactionCount: 4, repostCount: 2, zapTotalSats: 0, replyCount: 1 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useMyPubkey: () => 'me'.padEnd(64, '0'),
  useMyFollows: () => ['a'.repeat(64)],
  useCurrentRelayUrl: () => 'wss://relay.example',
  useUserMetadata: (pubkey: string) => ({
    displayName: pubkey.startsWith('g') ? 'Gigi' : 'Original Author',
    picture: null,
  }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import NoteCard from './NoteCard';

const ORIGINAL: NostrEvent = {
  id: 'o'.repeat(64),
  pubkey: 'a'.repeat(64),
  content: 'the original note',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
};

const REPOST: NostrEvent = {
  id: 'r'.repeat(64),
  pubkey: 'g'.repeat(64),
  content: JSON.stringify(ORIGINAL),
  created_at: 2000,
  tags: [['e', ORIGINAL.id], ['p', ORIGINAL.pubkey]],
  kind: 6,
  sig: '',
};

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
    // than the SVG icons beside it — easy to miss entirely.
    renderRepost();
    const attribution = screen.getByTestId('repost-attribution');
    expect(attribution).toHaveTextContent('Gigi');
    expect(attribution).toHaveTextContent('reposted');
    expect(attribution.className).toContain('text-[13px]');
    // An SVG icon, not a unicode glyph.
    expect(attribution.querySelector('svg')).toBeInTheDocument();
    expect(attribution.textContent).not.toContain('⇄');
  });

  it('opens the reposter profile from the attribution', () => {
    const onOpenProfile = vi.fn();
    renderRepost({ onOpenProfile });
    fireEvent.click(screen.getByTestId('repost-attribution'));
    expect(onOpenProfile).toHaveBeenCalledWith(REPOST.pubkey);
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
    // Liking a repost has to like the note that was reposted — otherwise the
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
