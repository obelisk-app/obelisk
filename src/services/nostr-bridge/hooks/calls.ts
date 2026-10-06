/**
 * Live-call hooks: the per-channel active call derived from SFU kind 31314
 * announcements and mesh kind 20078 beacons.
 */
import { useEffect, useState } from 'react';
import { useSubscription } from './subscription';

export interface ActiveCallInfo {
  hostPubkey: string;
  status: string;
  /**
   * Distinct-pubkey count published by the SFU. -1 means the SFU doesn't
   * tag count yet (older build, partial deploy), render the badge in
   * that case to preserve back-compat. 0 means the room is open during
   * empty-grace but nobody's actually in it; consumers should hide LIVE.
   */
  participantCount: number;
  expiresAt: number;
  createdAt: number;
  mode?: 'sfu' | 'mesh';
  participantPubkeys?: string[];
}

/**
 * Live-call state for every voice channel the relay knows about, derived
 * from SFU kind 31314 announcements and mesh kind 20078 beacons. Use the per-channel
 * variant {@link useActiveCall} for single-channel "LIVE" badges; use this
 * map directly when the consumer iterates many channels (sidebar GroupNode
 * renders).
 *
 * Entries auto-fade once `expiresAt` passes, the SFU republishes every
 * 60s, so a missing refresh after the TTL means "no call here".
 */
export function useActiveCallByChannel(): Readonly<Record<string, ActiveCallInfo>> {
  return useSubscription<Readonly<Record<string, ActiveCallInfo>>>(
    (b, cb) => b.subscribeActiveCallByChannel(cb),
    {},
  );
}

/**
 * Current when an SFU active-call advertisement or mesh presence beacon is
 * live for this channel. Auto-expires off the event's `expiration` tag.
 * UI: render a "LIVE" pill on the channel row when this is true.
 */
export function useActiveCall(channelId: string | null): ActiveCallInfo | null {
  const map = useActiveCallByChannel();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    // Re-evaluate every 15s so a stale entry fades without needing the
    // SFU to publish a `status=closed` update (which won't fire if the
    // SFU crashed).
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!channelId) return null;
  const entry = map[channelId];
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= now) return null;
  // Hide LIVE when the SFU explicitly reports 0 participants, the room
  // is in empty-grace, technically open server-side but nobody's there
  // to talk to. -1 = older SFU not tagging count, render to preserve
  // back-compat during a partial deploy.
  if (entry.participantCount === 0) return null;
  return entry;
}
