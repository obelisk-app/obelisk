import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

// Stands in for the markdown renderer: `linkifyHashtags` rewrites `#tag`
// into `[#tag](/t/tag)`, and what reaches the DOM is an anchor. The
// delegation under test keys on exactly that.
vi.mock('@/components/chat/message/MessageContent', () => ({
  default: ({ content }: { content: string }) => (
    <div>
      {content.split(/(\[#[^\]]+\]\([^)]+\))/).map((part, index) => {
        const link = part.match(/^\[(#[^\]]+)\]\(([^)]+)\)$/);
        return link
          ? <a key={index} href={link[2]}>{link[1]}</a>
          : <span key={index}>{part}</span>;
      })}
    </div>
  ),
}));

vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pubkey: string | null) => (pubkey ? { displayName: 'Alice' } : {}),
}));

const preview = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('@/hooks/social/note/useNotePreview', () => ({ useNotePreview: () => preview.value }));

import NoteContent from '@/components/social/note/NoteContent';

describe('hashtags in a note', () => {
  it('hands the tag to the host instead of navigating away', () => {
    // `/t/<tag>` is a real page for shared links, but inside the app
    // leaving for it throws away the feed you were reading.
    const onOpenTag = vi.fn();
    render(<NoteContent content="gm #bitcoin" onOpenTag={onOpenTag} />);

    const link = screen.getByText('#bitcoin');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(onOpenTag).toHaveBeenCalledWith('bitcoin');
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the anchor alone when the host has no tag surface', () => {
    render(<NoteContent content="gm #bitcoin" />);
    const link = screen.getByText('#bitcoin');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(link).toHaveAttribute('href', '/t/bitcoin');
  });

  it('respects a modified click, which means "open it somewhere else"', () => {
    const onOpenTag = vi.fn();
    render(<NoteContent content="gm #bitcoin" onOpenTag={onOpenTag} />);
    fireEvent.click(screen.getByText('#bitcoin'), { metaKey: true });
    expect(onOpenTag).not.toHaveBeenCalled();
  });

  it('ignores clicks on links that are not hashtags', () => {
    const onOpenTag = vi.fn();
    render(<NoteContent content="see [#x](https://example.com/t/x)" onOpenTag={onOpenTag} />);
    fireEvent.click(screen.getByText('#x'));
    expect(onOpenTag).not.toHaveBeenCalled();
  });

  it('decodes a tag that needed escaping in the URL', () => {
    const onOpenTag = vi.fn();
    render(<NoteContent content="gm #café" onOpenTag={onOpenTag} />);
    fireEvent.click(screen.getByText('#café'));
    expect(onOpenTag).toHaveBeenCalledWith('café');
  });
});

describe('addressable references', () => {
  const PK = 'a'.repeat(64);
  const naddr = nip19.naddrEncode({ identifier: '1712000000-why-nostr', pubkey: PK, kind: 30023 });
  const renderChip = (content: string) => render(
    <LocaleProvider initialLocale="en"><NoteContent content={content} /></LocaleProvider>,
  );

  it('names the author instead of printing a url slug', () => {
    // It used to render a bare underlined link labelled with the raw `d`
    // tag, so a reference to an article read as a fragment of a URL.
    renderChip(`read this nostr:${naddr}`);
    const chip = screen.getByTestId('address-ref');
    expect(chip).toHaveTextContent('Alice');
  });

  it('shows the slug as readable words, not a timestamped identifier', () => {
    renderChip(`nostr:${naddr}`);
    expect(screen.getByTestId('address-ref')).toHaveTextContent('why nostr');
    expect(screen.getByTestId('address-ref')).not.toHaveTextContent('1712000000');
  });

  it('links to the note viewer with the bech32 intact', () => {
    renderChip(`nostr:${naddr}`);
    expect(screen.getByTestId('address-ref')).toHaveAttribute('href', `/notes/${naddr}`);
  });

  it('renders a bare naddr too, not sixty characters of bech32', () => {
    renderChip(`look ${naddr}`);
    expect(screen.getByTestId('address-ref')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(naddr))).not.toBeInTheDocument();
  });
});

describe('people and notes in a note', () => {
  const PK = 'a'.repeat(64);
  const ID = 'e'.repeat(64);
  const renderNote = (content: string, props: Record<string, unknown> = {}) => render(
    <LocaleProvider initialLocale="en"><NoteContent content={content} {...props} /></LocaleProvider>,
  );

  it('renders a mention as a name that opens the profile', () => {
    const onOpenProfile = vi.fn();
    renderNote(`hi nostr:${nip19.npubEncode(PK)} there`, { onOpenProfile });
    const chip = screen.getByTestId('note-mention');
    expect(chip).toHaveTextContent('@Alice');
    fireEvent.click(chip);
    expect(onOpenProfile).toHaveBeenCalledWith(PK);
  });

  it('shows a skeleton while a referenced note loads, then its author and opening words', () => {
    preview.value = undefined;
    const onOpenNote = vi.fn();
    const content = `see nostr:${nip19.neventEncode({ id: ID, author: PK })}`;
    const { unmount } = renderNote(content, { onOpenNote });
    expect(screen.getByTestId('note-ref').querySelector('.lc-skeleton')).not.toBeNull();
    expect(screen.getByTestId('note-ref')).toHaveTextContent('Alice');
    unmount();
    preview.value = { id: ID, pubkey: PK, content: 'gm   everyone\n\nhave a day' };
    renderNote(content, { onOpenNote });
    expect(screen.getByTestId('note-ref')).toHaveTextContent('gm everyone have a day');
    fireEvent.click(screen.getByTestId('note-ref'));
    expect(onOpenNote).toHaveBeenCalledWith(ID);
  });

  it('falls back to a short id when no relay has the note', () => {
    preview.value = null;
    renderNote(`nostr:${nip19.noteEncode(ID)}`);
    expect(screen.getByTestId('note-ref')).toHaveTextContent(`${ID.slice(0, 12)}…`);
    expect(screen.getByTestId('note-ref').querySelector('.lc-skeleton')).toBeNull();
  });

  it('drops whitespace-only text between references', () => {
    preview.value = null;
    renderNote(`nostr:${nip19.noteEncode(ID)}   nostr:${nip19.npubEncode(PK)}`);
    const parts = screen.getByTestId('note-content').children;
    expect(parts).toHaveLength(2);
  });
});
