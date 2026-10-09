import type { JsDirectMessage } from '@/services/nostr-bridge';

/** The DM list's two tabs. */
export type DmListTab = 'follows' | 'others';

/** One conversation in the list: the peer and the last message. */
export interface DmPeer {
  pubkey: string;
  last: JsDirectMessage | undefined;
  sortKey: number;
}

/** Every conversation, the most recent first. */
export function dmPeers(dms: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>, known: Readonly<Record<string, number>> = {}): DmPeer[] {
  return [...new Set([...Object.keys(dms), ...Object.keys(known)])]
    .filter((pubkey) => (dms[pubkey]?.length ?? 0) > 0 || pubkey in known)
    .map((pubkey) => {
      const msgs = dms[pubkey] ?? [];
      const last = msgs.reduce<JsDirectMessage | undefined>((latest, message) => !latest || message.createdAt > latest.createdAt ? message : latest, undefined);
      return { pubkey, last, sortKey: Math.max(last?.createdAt ?? 0, known[pubkey] ?? 0) };
    })
    .sort((a, b) => b.sortKey - a.sortKey);
}

/** The conversations with people the user follows, and the rest, each in order. */
export function splitByFollows(peers: ReadonlyArray<DmPeer>, follows: ReadonlySet<string>): Record<DmListTab, DmPeer[]> {
  return {
    follows: peers.filter((p) => follows.has(p.pubkey)),
    others: peers.filter((p) => !follows.has(p.pubkey)),
  };
}

/** The tab the list opens on: Follows, unless only Others has anything in it. */
export function defaultDmListTab(followsCount: number, othersCount: number): DmListTab {
  return followsCount > 0 || othersCount === 0 ? 'follows' : 'others';
}

/** A row's one-line preview: whitespace runs collapsed, 60 characters, `youPrefix` on an outgoing one. */
export function dmPreview(last: JsDirectMessage | undefined, youPrefix: string): string | null {
  if (!last) return null;
  return (last.outgoing ? youPrefix : '') + last.content.replace(/\s+/g, ' ').slice(0, 60);
}

/** An unread count as a badge shows it. */
export function unreadBadgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
