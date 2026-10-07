import { useEffect, useState } from 'react';
import type { RelayAccessState } from '@/services/nostr-bridge';
import { type ChannelListEmptyReason, channelListEmptyReason } from '@/utils/shell/mobile/channel-list-empty';

/** How long a connected relay gets to finish its kind 39000 stream. */
const EOSE_GRACE_MS = 6000;

/** The reason for the current (connection, access) pair, after its grace period. */
export function useChannelListEmptyReason(
  relayAccess: RelayAccessState,
  connectionState: string,
  metadataEose: boolean,
): ChannelListEmptyReason {
  // Stamped with the (connection, access) pair it was measured for, so a
  // change in either starts a fresh wait with no reset step.
  const waitKey = `${connectionState}|${relayAccess}`;
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setWaitedFor(waitKey), EOSE_GRACE_MS);
    return () => clearTimeout(t);
  }, [waitKey]);
  return channelListEmptyReason(relayAccess, connectionState, metadataEose, waitedFor === waitKey);
}
