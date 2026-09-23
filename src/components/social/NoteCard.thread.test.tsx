import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: vi.fn(),
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 3 }),
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

const NOTE: NostrEvent = {
  id: 'e'.repeat(64),
  pubkey: 'a'.repeat(64),
  content: 'gm nostr',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
};

const renderCard = (props: Record<string, unknown>) => render(
  <LocaleProvider initialLocale="en">
    <NoteCard note={NOTE} {...props} />
  </LocaleProvider>,
);

/**
 * A note in a feed is a fragment — the post it answers, the replies under
 * it, who reacted. All of that used to live behind a ⋯ item, so the obvious
 * gesture (tap the thing you want to read more of) did nothing.
 */
describe('opening a note', () => {
  it('opens the thread when the card is clicked', () => {
    const onOpenNote = vi.fn();
    renderCard({ onOpenNote });

    fireEvent.click(screen.getByText('gm nostr'));
    expect(onOpenNote).toHaveBeenCalledWith(NOTE.id);
  });

  it('leaves the controls inside it alone', () => {
    // The card is full of real buttons — author, ⋯, the action row. A click
    // on one of those is not a click on the card.
    const onOpenNote = vi.fn();
    renderCard({ onOpenNote, onOpenProfile: vi.fn() });

    fireEvent.click(screen.getByTestId('note-more'));
    expect(onOpenNote).not.toHaveBeenCalled();
  });

  it('does not fire when the click was the end of a text selection', () => {
    const onOpenNote = vi.fn();
    renderCard({ onOpenNote });
    vi.spyOn(window, 'getSelection').mockReturnValue(
      { toString: () => 'gm' } as unknown as Selection,
    );

    fireEvent.click(screen.getByText('gm nostr'));
    expect(onOpenNote).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('opens the comments from the reply count, not a blank composer', () => {
    // The count says how many replies exist; tapping it and getting an
    // empty compose box answers a question nobody asked.
    const onOpenNote = vi.fn();
    const onReply = vi.fn();
    renderCard({ onOpenNote, onReply });

    fireEvent.click(screen.getByTestId('note-reply'));
    expect(onOpenNote).toHaveBeenCalledWith(NOTE.id);
    expect(onReply).not.toHaveBeenCalled();
  });

  it('still composes where there is no thread to open', () => {
    const onReply = vi.fn();
    renderCard({ onReply });

    fireEvent.click(screen.getByTestId('note-reply'));
    expect(onReply).toHaveBeenCalled();
  });

  it('gives the keyboard a real control for the same thing', () => {
    const onOpenNote = vi.fn();
    renderCard({ onOpenNote });

    fireEvent.click(screen.getByTestId('note-open-thread'));
    expect(onOpenNote).toHaveBeenCalledWith(NOTE.id);
  });

  it('is not clickable where a note is only being quoted', () => {
    const onOpenNote = vi.fn();
    renderCard({ onOpenNote, variant: 'quoted' });

    fireEvent.click(screen.getByText('gm nostr'));
    expect(onOpenNote).not.toHaveBeenCalled();
  });
});
