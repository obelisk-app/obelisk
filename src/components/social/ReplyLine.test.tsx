import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';

const AUTHOR = 'b'.repeat(64);
const PARENT_ID = 'a'.repeat(64);

const fetchNote = vi.fn(async () => ({
  id: PARENT_ID, pubkey: AUTHOR, content: 'the parent', createdAt: 1, tags: [],
}));

vi.mock('@nostr-wot/data', () => ({
  fetchNote: (...args: unknown[]) => fetchNote(...(args as [])),
  shortNpub: (hex: string) => `npub1${hex.slice(0, 6)}…`,
}));

vi.mock('@/lib/social/useAuthor', () => ({
  useAuthor: (pubkey: string | null) => (pubkey === AUTHOR ? { displayName: 'Alice' } : null),
}));

import ReplyLine from './ReplyLine';
import { __resetNotePreviewCache } from '@/lib/social/useNotePreview';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

describe('ReplyLine', () => {
  beforeEach(() => {
    __resetNotePreviewCache();
    fetchNote.mockClear();
  });

  /**
   * The whole point: a reply used to say only "Reply", naming neither who is
   * being answered nor offering a way to go read them.
   */
  it('names the author the note is replying to', () => {
    renderLocalized(
      <ReplyLine parent={{ id: PARENT_ID, author: AUTHOR, relay: null }} />,
    );
    expect(screen.getByText('Replying to')).toBeTruthy();
    expect(screen.getByTestId('reply-line-author').textContent).toBe('Alice');
  });

  /** The tag already carried the pubkey, so asking a relay would be waste. */
  it('does not fetch the parent when the tag named its author', () => {
    renderLocalized(
      <ReplyLine parent={{ id: PARENT_ID, author: AUTHOR, relay: null }} />,
    );
    expect(fetchNote).not.toHaveBeenCalled();
  });

  it('fetches the parent when the tag omitted the author', async () => {
    renderLocalized(
      <ReplyLine parent={{ id: PARENT_ID, author: null, relay: null }} />,
    );
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(fetchNote).toHaveBeenCalled();
  });

  it('opens the parent note when asked', async () => {
    const user = userEvent.setup();
    const onOpenNote = vi.fn();
    renderLocalized(
      <ReplyLine parent={{ id: PARENT_ID, author: AUTHOR, relay: null }} onOpenNote={onOpenNote} />,
    );
    await user.click(screen.getByTestId('reply-line-open-parent'));
    expect(onOpenNote).toHaveBeenCalledWith(PARENT_ID);
  });

  it('opens the parent author profile without also opening the card', async () => {
    const user = userEvent.setup();
    const onOpenProfile = vi.fn();
    const onCardClick = vi.fn();
    renderLocalized(
      <div onClick={onCardClick}>
        <ReplyLine parent={{ id: PARENT_ID, author: AUTHOR, relay: null }} onOpenProfile={onOpenProfile} />
      </div>,
    );
    await user.click(screen.getByTestId('reply-line-author'));
    expect(onOpenProfile).toHaveBeenCalledWith(AUTHOR);
    // The card's own handler opens the *reply's* thread — firing both would
    // navigate somewhere the reader did not ask for.
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it('still renders a line when the parent cannot be resolved', async () => {
    fetchNote.mockResolvedValueOnce(null as never);
    renderLocalized(<ReplyLine parent={{ id: PARENT_ID, author: null, relay: null }} />);
    expect(await screen.findByText('a note')).toBeTruthy();
  });
});
