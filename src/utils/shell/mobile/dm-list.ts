/** Shaping the phone DM screens' lists: conversations by their latest message, bubbles and marks. */

interface DmLike { readonly createdAt: number; readonly outgoing?: boolean }

/** Each conversation that has a message, with its latest one, newest conversation first. */
export function dmPeersByLatest<M extends DmLike>(
  dms: Readonly<Record<string, ReadonlyArray<M>>>,
): Array<{ peer: string; latest: M }> {
  const list: Array<{ peer: string; latest: M }> = [];
  for (const [peer, msgs] of Object.entries(dms)) {
    if (msgs.length === 0) continue;
    const sorted = [...msgs].sort((a, b) => b.createdAt - a.createdAt);
    list.push({ peer, latest: sorted[0] });
  }
  list.sort((a, b) => b.latest.createdAt - a.latest.createdAt);
  return list;
}

/** The conversations with people you follow, and with everyone else. */
export function splitByFollows<T extends { peer: string }>(
  peers: ReadonlyArray<T>,
  follows: ReadonlySet<string>,
): { follows: T[]; others: T[] } {
  return {
    follows: peers.filter((p) => follows.has(p.peer)),
    others: peers.filter((p) => !follows.has(p.peer)),
  };
}

/** A DM bubble's classes: its direction, then pending and failed. */
export function dmBubbleClass(msg: { outgoing: boolean; pending?: boolean; failed?: boolean }): string {
  return 'dm-bubble '
    + (msg.outgoing ? 'outgoing delivered' : 'incoming') // i18n-exempt: CSS class names
    + (msg.pending ? ' pending' : '')
    + (msg.failed ? ' failed' : '');
}

/** A thread entry's post-quantum mark: the mark at its message index, none for a divider or past the list. */
export function markAt<K>(marks: ReadonlyArray<K | null>, item: { type: string; index?: number }): K | null {
  return item.type === 'msg' && item.index !== undefined ? marks[item.index] ?? null : null;
}
