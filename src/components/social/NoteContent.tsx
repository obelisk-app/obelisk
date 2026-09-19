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

import { useEffect, useMemo } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { nostrActions, useUserMetadata } from '@/lib/nostr-bridge';
import { tokenizeContent, type NostrRef } from '@/lib/social/nip27';
import { linkifyHashtags } from '@/lib/profile-feed';
import MessageContent from '@/components/chat/MessageContent';

export default function NoteContent({
  content,
  noteId,
  onOpenProfile,
  onOpenNote,
}: {
  content: string;
  noteId?: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  const tokens = useMemo(() => tokenizeContent(content), [content]);

  // Fast path: no references, so nothing to interleave.
  if (tokens.length === 1 && tokens[0].kind === 'text') {
    return (
      <MessageContent content={linkifyHashtags(content)} messageId={noteId} wideMedia />
    );
  }

  return (
    <div className="space-y-1" data-testid="note-content">
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
  const meta = useUserMetadata(pubkey);

  useEffect(() => {
    void nostrActions.ensureUserMetadata(pubkey).catch(() => {});
  }, [pubkey]);

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
