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
import { useNotePreview } from '@/lib/social/useNotePreview';
import { useTranslation } from '@/i18n/context';
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
    return <EventRefChip refValue={refValue} onOpenNote={onOpenNote} />;
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

/**
 * A referenced note, named rather than hashed.
 *
 * This printed `↗ efaa274291b5…` — the id of a thing, which tells a reader
 * nothing about the thing. It now resolves to the author and the opening
 * words, which is what a quote looks like everywhere else, and falls back to
 * the short id only when no relay still has the note.
 *
 * The author often arrives free: an `nevent` carries the pubkey, so the name
 * can render while the body is still in flight.
 */
function EventRefChip({
  refValue,
  onOpenNote,
}: {
  refValue: Extract<NostrRef, { type: 'event' }>;
  onOpenNote?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const preview = useNotePreview(refValue.id, refValue.relays);
  const authorPubkey = refValue.author ?? preview?.pubkey ?? null;
  const meta = useAuthor(authorPubkey);

  const name = authorPubkey
    ? meta?.displayName || meta?.name || shortNpub(authorPubkey)
    : null;
  const snippet = preview?.content?.replace(/\s+/g, ' ').trim();
  const loading = preview === undefined;

  return (
    <button
      type="button"
      className="my-1 flex w-full max-w-full flex-col gap-0.5 rounded-lg border border-lc-border bg-lc-dark/60 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-lc-green/40"
      onClick={() => onOpenNote?.(refValue.id)}
      data-testid="note-ref"
      title={t('social.openNote')}
    >
      <span className="flex min-w-0 items-center gap-1 text-lc-muted">
        <span aria-hidden="true">↗</span>
        {name ? (
          <span className="min-w-0 truncate font-medium text-lc-green">{name}</span>
        ) : (
          <span className="min-w-0 truncate font-mono">{refValue.id.slice(0, 12)}…</span>
        )}
      </span>
      {loading ? (
        <span className="lc-skeleton h-3 w-2/3 rounded" aria-hidden="true" />
      ) : snippet ? (
        <span className="line-clamp-2 min-w-0 text-lc-white/75">{snippet}</span>
      ) : null}
    </button>
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
