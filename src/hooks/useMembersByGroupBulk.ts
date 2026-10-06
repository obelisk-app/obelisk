import { useEffect, useState } from 'react';
import { useBridge } from '@/services/nostr-bridge';

export type MembersByGroup = Readonly<Record<string, ReadonlyArray<string>>>;

/**
 * Every group's member list at once, straight from the bridge's
 * `membersByGroup` store. The bridge exposes per-group `subscribeMembers`
 * but no bulk subscriber for the whole relay; reading the store directly
 * keeps a relay-wide panel from spawning N hooks just to enumerate state
 * that is already in memory. Returns `{}` until the provider has the bridge.
 */
export function useMembersByGroupBulk(): MembersByGroup {
  const bridge = useBridge();
  const [snapshot, setSnapshot] = useState<MembersByGroup>({});
  useEffect(() => {
    if (!bridge) return;
    return bridge.membersByGroup.subscribe((m) => setSnapshot(m));
  }, [bridge]);
  return snapshot;
}
