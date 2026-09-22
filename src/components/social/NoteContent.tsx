'use client';

/**
 * Renders a social note's body, resolving NIP-27 `nostr:` references that the
 * chat renderer knows nothing about.
 *
 * `MessageContent` handles markdown, media, emoji and link previews, and we
 * keep it for those — but it has no concept of `nostr:npub…`, so a mention
 * from Primal/Amethyst/Damus used to render as 60 characters of raw bech32
 * mid-sentence. Here we split the content around those references, hand the
 * text runs to `MessageContent`, and render the references as real UI.
 */

import { useMemo } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { useAuthor } from '@/lib/social/useAuthor';
import { tokenizeContent, type NostrRef } from '@/lib/social/nip27';
import { linkifyHashtags } from '@/lib/profile-feed';
import MessageContent from '@/components/chat/MessageContent';

export default function NoteContent({
  content,
  noteId,
  onOpenProfile,
  onOpenNote,
  onOpenTag,
}: {
  content: string;
  noteId?: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  /**
   * Handle a hashtag in-app instead of navigating to `/t/<tag>`.
   *
   * `linkifyHashtags` turns `#bitcoin` into a markdown link so the public
   * viewer pages have somewhere real to point — but inside the app, leaving
   * for a standalone page throws away the feed you were reading. Hosts that
   * have a tag surface of their own (the feed's search) pass this and the
   * link becomes an in-app action; hosts that don't leave it alone and the
   * anchor still works.
   */
  onOpenTag?: (tag: string) => void;
}) {
  const tokens = useMemo(() => tokenizeContent(content), [content]);

  // Delegated rather than per-link: the anchors are produced inside
  // `MessageContent`'s markdown renderer, which has no hook for this.
  const onClick = onOpenTag
    ? (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest?.('a');
      const href = anchor?.getAttribute('href');
      const tag = href?.match(/^\/t\/([^/?#]+)$/)?.[1];
      if (!tag) return;
      // Let a modified click do what the reader asked (new tab, etc.).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      onOpenTag(decodeURIComponent(tag));
    }
    : undefined;

  // Fast path: no references, so nothing to interleave.
  if (tokens.length === 1 && tokens[0].kind === 'text') {
    return (
      <div onClick={onClick} data-testid="note-content">
        <MessageContent content={linkifyHashtags(content)} messageId={noteId} wideMedia />
      </div>
    );
  }

  return (
    <div className="space-y-1" onClick={onClick} data-testid="note-content">
      {tokens.map((token, index) => (
        token.kind === 'text' ? (
          token.value.trim() ? (
            <MessageContent
              key={`t${index}`}
              content={linkifyHashtags(token.value)}
              messageId={noteId}
              wideMedia
            />
          ) : null
        ) : (
          <NostrRefChip
            key={`r${index}`}
            refValue={token.ref}
            onOpenProfile={onOpenProfile}
            onOpenNote={onOpenNote}
          />
        )
      ))}
    </div>
  );
}

function NostrRefChip({
  refValue,
  onOpenProfile,
  onOpenNote,
}: {
  refValue: NostrRef;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  if (refValue.type === 'pubkey') {
    return <MentionChip pubkey={refValue.pubkey} onOpen={onOpenProfile} />;
  }
  if (refValue.type === 'event') {
    return (
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-lc-border bg-lc-dark px-2 py-1 text-xs text-lc-muted hover:text-lc-white"
        onClick={() => onOpenNote?.(refValue.id)}
        data-testid="note-ref"
      >
        <span aria-hidden="true">↗</span>
        <span className="truncate font-mono">{refValue.id.slice(0, 12)}…</span>
      </button>
    );
  }
  // naddr — long-form and other addressable content. We don't render those
  // inline yet; a link out beats printing bech32.
  return (
    <a
      href={`/notes/${refValue.raw.replace(/^nostr:/, '')}`}
      className="text-xs text-lc-green underline"
    >
      {refValue.identifier || 'article'}
    </a>
  );
}

function MentionChip({ pubkey, onOpen }: { pubkey: string; onOpen?: (pubkey: string) => void }) {
  const meta = useAuthor(pubkey);

  const label = meta?.displayName || meta?.name || shortNpub(pubkey);

  return (
    <button
      type="button"
      className="rounded px-1 font-medium text-lc-green hover:underline"
      onClick={() => onOpen?.(pubkey)}
      data-testid="note-mention"
    >
      @{label}
    </button>
  );
}

function shortNpub(pubkey: string): string {
  try {
    const npub = hexToNpub(pubkey);
    return `${npub.slice(0, 10)}…`;
  } catch {
    return `${pubkey.slice(0, 8)}…`;
  }
}
