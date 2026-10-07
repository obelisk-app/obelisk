import type { Event as NostrEvent } from 'nostr-tools';
import type { NoteEngagement } from '@/hooks/social/note/useNoteEngagement';

/**
 * The action row's handlers. Reply opens the conversation when the host can
 * show one, rather than a composer: the count says how many replies there
 * are, and tapping it to get a blank compose box answers a question nobody
 * asked. Only a host with no thread view falls back to the composer.
 */
export function useNoteActionRow({
  note,
  engagement,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
}: {
  note: NostrEvent;
  engagement: NoteEngagement;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
}) {
  return {
    reply: () => (onOpenNote ? onOpenNote(note.id) : onReply?.(note)),
    repost: () => void engagement.repost(),
    /** Absent when the host can't compose a quote: the repost button then stays one tap. */
    quote: onQuote ? () => onQuote(note) : undefined,
    react: () => void engagement.react(),
    zap: () => onZap?.(note),
    share: () => void engagement.share(),
  };
}
