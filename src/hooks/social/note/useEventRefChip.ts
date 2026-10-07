import type { NostrRef } from '@/services/social/nip27';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useNotePreview } from '@/hooks/social/note/useNotePreview';
import { displayNameFor } from '@/utils/identity/display-name';
import { noteSnippet } from '@/utils/social/note-refs';

/**
 * A referenced note, named rather than hashed: its author (often free, since
 * an `nevent` carries the pubkey, so the name can render while the body is
 * still in flight) and its opening words once a relay returns it.
 */
export function useEventRefChip(refValue: Extract<NostrRef, { type: 'event' }>) {
  const preview = useNotePreview(refValue.id, refValue.relays);
  const authorPubkey = refValue.author ?? preview?.pubkey ?? null;
  const meta = useAuthor(authorPubkey);
  return {
    name: authorPubkey ? displayNameFor(authorPubkey, meta) : null,
    snippet: noteSnippet(preview?.content),
    loading: preview === undefined,
  };
}
