/** Shaping one row of the phone channel list. */

/**
 * The row's classes, newline-joined as the row always has been: `active`,
 * `unread` when there is unread traffic, `ch-thread` for a forum thread
 * shown under its forum, `ch-row-split` for a forum with a chevron button.
 */
export function channelRowClass({ active, unread, indent, split }: {
  active?: boolean;
  unread: number;
  indent?: boolean;
  split?: boolean;
}): string {
  const cls = ['ch-row'];
  if (active) cls.push('active');
  if (unread > 0) cls.push('unread');
  if (indent) cls.push('ch-thread');
  if (split) cls.push('ch-row-split');
  return cls.join(String.fromCharCode(10));
}

/** A row count as shown: the number up to 99, then `99+`. */
export function rowCount(n: number): string | number {
  return n > 99 ? '99+' : n;
}

/**
 * What a row asks attention for. An unfollowed channel's traffic stops
 * counting; its mentions still do. The mention cards survive a relay
 * switch, the loaded-message highlights do not, so the larger one wins.
 */
export function rowAttention(
  highlights: { unread: number; mentions: number; replies: number },
  mentionCards: number,
  unfollowed: boolean | undefined,
): { unread: number; mentionsOrReplies: number } {
  return {
    unread: unfollowed ? 0 : highlights.unread,
    mentionsOrReplies: Math.max(highlights.mentions + highlights.replies, mentionCards),
  };
}

export function isVoiceKind(kind: string): boolean {
  return kind === 'voice' || kind === 'voice-sfu';
}
