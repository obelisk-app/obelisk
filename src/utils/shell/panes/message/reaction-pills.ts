import { resolveReactionEmoji, type GroupedReaction } from '@/utils/message-text/emoji-shortcodes';
import type { RecentEmoji } from '@/services/chat/picker/recent-emojis';

/**
 * The reaction row under a desktop message, and the quick-reaction slots of
 * its toolbar and menu, shaped for the markup. Pure.
 */

/** Minimal zap total the pill row reads. */
export interface ZapTotalLike { readonly totalSats: number }

/** The zap total when there is one worth a pill, else null. */
export function zapPillTotal<T extends ZapTotalLike>(zapTotal: T | null): T | null {
  return zapTotal && zapTotal.totalSats > 0 ? zapTotal : null;
}

/** Whether the row under a message renders at all: a reaction or a zap. */
export function hasReactionRow(counts: ReadonlyArray<unknown>, zapTotal: ZapTotalLike | null): boolean {
  return counts.length > 0 || zapPillTotal(zapTotal) !== null;
}

export type ReactionPillTitleKey =
  | 'shell.desktop.reactions.removeEveryone'
  | 'shell.desktop.reactions.removeOwn'
  | 'shell.desktop.reactions.react';

export interface ReactionPill extends GroupedReaction {
  readonly resolved: ReturnType<typeof resolveReactionEmoji>;
  /** Highlighted: an admin can remove it for everyone, or it is the viewer's own. */
  readonly active: boolean;
  readonly titleKey: ReactionPillTitleKey;
  /** For an admin, every reaction of this emoji, so a click removes them all. */
  readonly removeIds: ReadonlyArray<string> | undefined;
}

/** One pill per emoji: what it shows, whether it is lit, and what a click does. */
export function reactionPills(
  counts: ReadonlyArray<GroupedReaction>,
  myReactedEmojis: ReadonlySet<string>,
  isAdmin: boolean,
): ReactionPill[] {
  return counts.map((c) => {
    const mine = myReactedEmojis.has(c.emoji);
    return {
      ...c,
      resolved: resolveReactionEmoji(c.emoji, c.customEmojis),
      active: isAdmin || mine,
      titleKey: isAdmin
        ? 'shell.desktop.reactions.removeEveryone'
        : mine ? 'shell.desktop.reactions.removeOwn' : 'shell.desktop.reactions.react',
      removeIds: isAdmin ? c.reactionIds : undefined,
    };
  });
}

export interface QuickReactionSlot {
  readonly emoji: RecentEmoji;
  /** Already sent by the viewer: the slot is disabled. */
  readonly mine: boolean;
}

/** The recent emojis offered as one-click reactions, each marked when already sent. */
export function quickReactionSlots(
  quick: ReadonlyArray<RecentEmoji>,
  myReactedEmojis: ReadonlySet<string>,
): QuickReactionSlot[] {
  return quick.map((emoji) => ({ emoji, mine: myReactedEmojis.has(emoji.char) }));
}
