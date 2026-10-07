'use client';

import type { ContentToken } from '@/services/social/nip27';
import { linkifyHashtags } from '@/services/social/profile-feed';
import MessageContent from '@/components/chat/message/MessageContent';
import MentionChip from './MentionChip';
import EventRefChip from './EventRefChip';
import AddressRefChip from './AddressRefChip';

/**
 * One run of a note body: a text run through the chat renderer (dropped when
 * it is only whitespace), or a `nostr:` reference as a chip for a person, a
 * note or an addressable event.
 */
export default function NoteContentPart({
  token,
  noteId,
  onOpenProfile,
  onOpenNote,
}: {
  token: ContentToken;
  noteId?: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  if (token.kind === 'text') {
    if (!token.value.trim()) return null;
    return <MessageContent content={linkifyHashtags(token.value)} messageId={noteId} wideMedia />;
  }
  const ref = token.ref;
  if (ref.type === 'pubkey') return <MentionChip pubkey={ref.pubkey} onOpen={onOpenProfile} />;
  if (ref.type === 'event') return <EventRefChip refValue={ref} onOpenNote={onOpenNote} />;
  return <AddressRefChip refValue={ref} />;
}
