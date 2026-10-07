/**
 * What the reaction and zap hover cards under a message list: the first
 * people, and how many more there are. Pure, for
 * `src/app/[locale]/app/panes/message/ReactorHoverCard.tsx` and
 * `ZapperHoverCard.tsx`.
 */

/** How many names a hover card lists before "and N more". */
export const HOVER_CARD_LIMIT = 20;

export interface HoverCardList<T> {
  readonly shown: ReadonlyArray<T>;
  /** How many were left out. */
  readonly extra: number;
  readonly total: number;
}

function cap<T>(all: ReadonlyArray<T>, limit: number): HoverCardList<T> {
  const shown = all.slice(0, limit);
  return { shown, extra: all.length - shown.length, total: all.length };
}

/** Everyone who reacted with one emoji, in the order they reacted. */
export function topReactors(pubkeys: ReadonlySet<string>, limit = HOVER_CARD_LIMIT): HoverCardList<string> {
  return cap(Array.from(pubkeys), limit);
}

/** Everyone who zapped a message with their total, largest first. */
export function topZappers(
  zapperAmounts: ReadonlyMap<string, number>,
  limit = HOVER_CARD_LIMIT,
): HoverCardList<readonly [string, number]> {
  return cap(Array.from(zapperAmounts.entries()).sort((a, b) => b[1] - a[1]), limit);
}
