import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: vi.fn(),
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useMyPubkey: () => 'me'.padEnd(64, '0'),
  useMyFollows: () => [],
  useCurrentRelayUrl: () => 'wss://public.obelisk.ar',
  useUserMetadata: () => ({ displayName: 'Alice', picture: null }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import NoteCard from './NoteCard';

const event = (over: Partial<NostrEvent>): NostrEvent => ({
  id: 'e'.repeat(64),
  pubkey: 'a'.repeat(64),
  content: '',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

const wrap = (note: NostrEvent) => render(
  <LocaleProvider initialLocale="en"><NoteCard note={note} /></LocaleProvider>,
);

describe('kinds the viewer used to refuse', () => {
  it('renders a NIP-29 group message with a way back to its room', () => {
    // It said "this client can't display this note yet (kind 9)" — about
    // its own chat messages.
    wrap(event({ kind: 9, content: 'said in the group', tags: [['h', 'group-1']] }));

    expect(screen.getByTestId('note-group-message')).toHaveTextContent('said in the group');
    const link = screen.getByTestId('note-open-in-group');
    expect(link).toHaveAttribute('href', expect.stringContaining('c=group-1'));
    expect(link).toHaveAttribute('href', expect.stringContaining('public.obelisk.ar'));
  });

  it('renders a group message without an h tag as plain text', () => {
    wrap(event({ kind: 9, content: 'orphan message' }));
    expect(screen.getByTestId('note-group-message')).toHaveTextContent('orphan message');
    expect(screen.queryByTestId('note-open-in-group')).not.toBeInTheDocument();
  });

  it('renders a NIP-94 file, whose media lives in tags', () => {
    // Rendering the content alone showed a caption with no file.
    wrap(event({
      kind: 1063,
      content: 'a photo',
      tags: [['url', 'https://example.com/a.jpg'], ['m', 'image/jpeg']],
    }));
    expect(screen.getByTestId('note-file')).toHaveTextContent('a photo');
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/a.jpg');
  });

  it('shows the text of a kind it does not model, instead of hiding it', () => {
    // A kind we have no special view for is usually still readable, and
    // hiding it behind "can't display this" is worse than rendering it.
    wrap(event({ kind: 31923, content: 'a calendar event body' }));
    const card = screen.getByTestId('note-unsupported');
    expect(card).toHaveTextContent('a calendar event body');
    expect(card).toHaveTextContent('kind 31923');
  });

  it('still names the kind when there is no text at all', () => {
    wrap(event({ kind: 31923, content: '' }));
    expect(screen.getByTestId('note-unsupported')).toHaveTextContent('kind 31923');
  });
});
