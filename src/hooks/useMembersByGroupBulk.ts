import { useEffect, useState } from 'react';
import { getBridgeImpl } from '@/services/nostr-bridge';

export type MembersByGroup = Readonly<Record<string, ReadonlyArray<string>>>;

/**
 * Every group's member list at once, straight from the bridge's
 * `membersByGroup` store. The bridge exposes per-group `subscribeMembers`
 * but no bulk subscriber for the whole relay; reading the store directly
 * keeps a relay-wide panel from spawning N hooks just to enumerate state
 * that is already in memory. Returns `{}` until the bridge exists.
 */
export function useMembersByGroupBulk(): MembersByGroup {
  const [snapshot, setSnapshot] = useState<MembersByGroup>({});
  useEffect(() => {
    const impl = getBridgeImpl();
    if (!impl) return;
    const unsub = impl.membersByGroup.subscribe((m) => setSnapshot(m));
    return () => unsub();
  }, []);
  return snapshot;
}
