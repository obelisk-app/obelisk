import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Stands in for the markdown renderer: `linkifyHashtags` rewrites `#tag`
// into `[#tag](/t/tag)`, and what reaches the DOM is an anchor. The
// delegation under test keys on exactly that.
vi.mock('@/components/chat/MessageContent', () => ({
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

vi.mock('@/lib/social/useAuthor', () => ({ useAuthor: () => ({ displayName: 'Alice' }) }));

import NoteContent from './NoteContent';

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
