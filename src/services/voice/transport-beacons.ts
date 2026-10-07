/**
 * Presence beacons (kind 20078): the periodic one that announces the two
 * peer sets and the outbound video, and the terminal one on leave.
 */
import { KIND_VOICE_PRESENCE } from '@/utils/nostr/nip-kinds';
import type { VideoSlotKind } from './types';
import { PRESENCE_TTL_SECONDS, bridge, publishViaBridge, type VoiceTransportOptions } from './transport-core';

/**
 * Publish a presence beacon for the given channel.
 *
 * @param channelId - NIP-29 group id this beacon advertises presence in.
 * @param connectedTo - Peer pubkeys the publisher currently has live
 *   RTCPeerConnections to. Emitted as `p` tags so other participants can
 *   discover them transitively when their relay drops the publisher's
 *   own beacon. Empty / omitted = "no successful connections yet"
 *   (cold-started client).
 * @param knownPeers - Pubkeys the publisher has itself observed in the
 *   call: its own PCs plus live beacons it received. Emitted as `peer`
 *   tags. Readers no longer treat them as participants (see
 *   `transitiveParticipants`); the tags stay for older clients.
 * @param videoTracks - Outbound video tracks the publisher is currently
 *   sending (any of `camera`, `screen`). Emitted as `v` tags so every
 *   participant can compute the independent four-camera and one-screen caps (see `client.ts`). Empty for audio-only joiners.
 *
 * Caller is responsible for the cadence (every ~10s while in the channel)
 * and for opportunistic re-publishes when `connectedTo`, `knownPeers`,
 * or `videoTracks` changes.
 */
export async function publishPresenceBeacon(
  channelId: string,
  connectedTo: readonly string[] = [],
  knownPeers: readonly string[] = [],
  videoTracks: readonly VideoSlotKind[] = [],
  options: VoiceTransportOptions = {},
): Promise<void> {
  const b = await bridge();
  const expiration = Math.floor(Date.now() / 1000) + PRESENCE_TTL_SECONDS;
  const tags: string[][] = [
    ['e', channelId],
    ['t', 'obelisk-voice-presence'],
    ['expiration', String(expiration)],
  ];
  // Dedup so a flapping connection-state-change doesn't spam tags.
  const seenP = new Set<string>();
  for (const pk of connectedTo) {
    if (!pk || seenP.has(pk)) continue;
    seenP.add(pk);
    tags.push(['p', pk]);
  }
  const seenKnown = new Set<string>();
  for (const pk of [...knownPeers, ...connectedTo]) {
    if (!pk || seenKnown.has(pk)) continue;
    seenKnown.add(pk);
    tags.push(['peer', pk]);
  }
  const seenV = new Set<string>();
  for (const kind of videoTracks) {
    if (kind !== 'camera' && kind !== 'screen') continue;
    if (seenV.has(kind)) continue;
    seenV.add(kind);
    tags.push(['v', kind]);
  }
  await publishViaBridge(
    b,
    {
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags,
    },
    options,
  );
  console.log(
    '[voice] beacon published for', channelId.slice(0, 8),
    '+', connectedTo.length, 'connections',
    '+', new Set([...knownPeers, ...connectedTo]).size, 'known',
    videoTracks.length > 0 ? `+ video=[${videoTracks.join(',')}]` : '',
  );
}

/**
 * Publish a terminal mesh presence update. This is intentionally the same
 * kind/tag family as the normal beacon, but with a short expiration and an
 * explicit status marker so subscribers can remove the publisher immediately
 * instead of waiting for the previous beacon's TTL. The expiration is a few
 * seconds out, not in the past, so NIP-40 relays still deliver it.
 */
export async function publishLeavePresence(
  channelId: string,
  options: VoiceTransportOptions = {},
): Promise<void> {
  const b = await bridge();
  const now = Math.floor(Date.now() / 1000);
  await publishViaBridge(
    b,
    {
      kind: KIND_VOICE_PRESENCE,
      content: '',
      tags: [
        ['e', channelId],
        ['t', 'obelisk-voice-presence'],
        ['status', 'left'],
        // Short but in the future: a relay enforcing NIP-40 drops an event
        // that is already expired before delivering it, and then everyone
        // waits out the previous beacon's TTL. `status: left` is what makes
        // it terminal; this only bounds how long the relay keeps it.
        ['expiration', String(now + 10)],
      ],
    },
    options,
  );
  console.log('[voice] leave beacon published for', channelId.slice(0, 8));
}
