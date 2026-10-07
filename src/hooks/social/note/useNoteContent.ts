import { useMemo, type MouseEvent } from 'react';
import { tokenizeContent } from '@/services/social/nip27';
import { hashtagOfHref } from '@/utils/social/note-refs';

/**
 * A note body's view model: its text split around `nostr:` references, and
 * the click handler that turns hashtag links into an in-app action when the
 * host has a tag surface (`onOpenTag`).
 *
 * Delegated rather than per-link: the anchors are produced inside
 * `MessageContent`'s markdown renderer, which has no hook for this.
 */
export function useNoteContent({ content, onOpenTag }: { content: string; onOpenTag?: (tag: string) => void }) {
  const tokens = useMemo(() => tokenizeContent(content), [content]);

  const onClick = onOpenTag
    ? (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest?.('a');
      const tag = hashtagOfHref(anchor?.getAttribute('href'));
      if (!tag) return;
      // Let a modified click do what the reader asked (new tab, etc.).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      onOpenTag(decodeURIComponent(tag));
    }
    : undefined;

  return {
    tokens,
    /** No references, so nothing to interleave: the whole body is one text run. */
    plain: tokens.length === 1 && tokens[0].kind === 'text',
    onClick,
  };
}
