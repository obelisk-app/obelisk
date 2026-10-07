import type { JsGroup } from '@/services/nostr-bridge';

/**
 * Pure pieces of one desktop channel row (`GroupNode`).
 */

/** Left padding of a row: nested rows step in by 0.85rem past the first level. */
export function groupNodeIndent(depth: number): string {
  return `${0.5 + Math.max(0, depth - 1) * 0.85}rem`;
}

/** A channel's name, or the start of its id while it has none. */
export function groupLabel(group: Pick<JsGroup, 'id' | 'name'>): string {
  return group.name ?? group.id.slice(0, 12);
}

export interface GroupBadgeInput {
  /** The row is the open channel: its own unread and mention counts are about to be cleared. */
  readonly active: boolean;
  /** The person stopped following the channel: its traffic no longer asks for attention. */
  readonly unfollowed: boolean;
  readonly unread: number;
  readonly mentions: number;
  readonly replies: number;
  /** Mention cards still waiting to be seen; they show even on the open row. */
  readonly mentionCards: number;
}

/** The two badges of a row: plain unread, and mentions-or-replies. */
export function groupBadges(input: GroupBadgeInput): { unread: number; mentionsOrReplies: number } {
  const showBadges = !input.active;
  return {
    unread: showBadges && !input.unfollowed ? input.unread : 0,
    mentionsOrReplies: Math.max(showBadges ? input.mentions + input.replies : 0, input.mentionCards),
  };
}

/** The hover text naming a channel's web-of-trust distance, when it has one. */
export function wotDistanceTitle(distance: number | null | undefined): string | undefined {
  return distance != null ? `WoT ${distance}°` : undefined;
}
