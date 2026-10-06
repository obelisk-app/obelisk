import type { Event as NostrEvent } from 'nostr-tools';

export type NoteCardProps = {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  onOpenArticle?: (note: NostrEvent) => void;
  /** Hashtags open in-app (the feed's search) instead of leaving for /t. */
  onOpenTag?: (tag: string) => void;
  /**
   * Everyone who reposted this note, newest first. A repost row renders the
   * whole list; without it "eight people reposted this" reads as one
   * anonymous row, which throws away the only signal a repost carries.
   */
  reposters?: readonly string[];
  /**
   * `full`: a normal row with the whole action set.
   * `quoted`: a bordered box with no actions, for a note embedded inside
   *   another note's body (you act on the outer note, not the quoted one).
   *
   * These used to be one `embedded` boolean, which conflated "draw it as a
   * box" with "no actions". A repost needs the first and NOT the second: the
   * whole point is to reply to, like or zap the note that was reposted.
   */
  variant?: 'full' | 'quoted';
  /** Parent already supplies the outer padding (repost attribution wrapper). */
  nested?: boolean;
};
