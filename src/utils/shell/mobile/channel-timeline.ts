/**
 * Props for the phone channel's memoized message rows, picked so that an
 * unchanged row gets the same objects on every render (see `ChannelMessage`).
 */

/** Stable empty list so a message without reactions keeps the same prop identity. */
export const EMPTY_REACTIONS: never[] = [];

/** The message a reply quotes, from the batch's lookup: the same object every render, or null. */
export function replyParentOf<M extends { replyToId: string | null }>(msg: M, byId: ReadonlyMap<string, M>): M | null {
  return msg.replyToId ? byId.get(msg.replyToId) ?? null : null;
}

/** A message's reactions, or the shared empty list. */
export function reactionsFor<R>(reactions: Readonly<Record<string, ReadonlyArray<R>>>, messageId: string): ReadonlyArray<R> {
  return reactions[messageId] ?? EMPTY_REACTIONS;
}
