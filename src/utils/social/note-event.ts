/**
 * A feed entry back as the Nostr event it came from.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { NoteEntry } from '@nostr-wot/data';
import { KIND_TEXT_NOTE } from '@/constants/nostr/nip-kinds';

/** The SDK returns a lighter NoteEntry; the UI wants real events. */
export function toEvent(entry: NoteEntry): NostrEvent {
  return {
    id: entry.id,
    pubkey: entry.pubkey,
    content: entry.content,
    created_at: entry.createdAt,
    tags: entry.tags,
    kind: KIND_TEXT_NOTE,
    sig: '',
  };
}
