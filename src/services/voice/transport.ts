/**
 * Thin Nostr transport for voice channels: presence beacons + per-peer
 * signaling. Publishes through the nostr-bridge signer; roster and signal
 * subscriptions go through `subscribeVoiceFilterWatched`, which puts them on
 * the RelayHub at `'voice'` priority, so when a relay's per-WebSocket REQ cap
 * is near the hub parks a background chat stream rather than the call, and
 * a call on the relay being browsed shares its socket and its NIP-42 AUTH.
 *
 * Beacons (kind 20078) announce two peer sets:
 *  - `p` tags: peers with confirmed live RTCPeerConnections.
 *  - `peer` tags: peers the publisher currently knows are active in the
 *    call, even if the direct PC is not established yet.
 *
 * VoiceClient unions both sets for transitive discovery. A fresh joiner
 * whose relay drops some publishers' beacons can still learn about them
 * from another participant's signed beacon or WebRTC control-channel
 * snapshot, so mesh formation converges from partial connectivity.
 *
 * Signaling (kind 25050) carries SDP / ICE / track-info / quality hints /
 * polite-side `requestReset` payloads.
 *
 * v1 publishes signed plaintext ephemeral events. We can swap to gift-wrap
 * later without changing the transport surface.
 *
 * This module is the surface; the calls live beside it: `transport-core.ts`
 * (the publish / subscribe options every call
 * shares), `transport-beacons.ts`, `transport-roster.ts`,
 * `transport-signals.ts`. Tests mock this module by path, so everything the
 * rest of the voice code reaches goes through here.
 */
import { getBridgeImpl } from '@/services/nostr-bridge';
import type { VoicePresence, VoiceSignalPayload, VideoSlotKind } from '@/types/voice/protocol';
import type { VoiceTransportOptions } from './transport-core';
import { publishLeavePresence, publishPresenceBeacon } from './transport-beacons';
import { subscribeRoster } from './transport-roster';
import { sendSignal, subscribeSignals } from './transport-signals';

export type { VoiceTransportOptions } from './transport-core';
export { publishLeavePresence, publishPresenceBeacon } from './transport-beacons';
export { subscribeRoster } from './transport-roster';
export { sendSignal, subscribeSignals } from './transport-signals';

export interface VoiceTransport {
  publishPresenceBeacon(
    channelId: string,
    connectedTo?: readonly string[],
    knownPeers?: readonly string[],
    videoTracks?: readonly VideoSlotKind[],
  ): Promise<void>;
  publishLeavePresence(channelId: string): Promise<void>;
  subscribeRoster(channelId: string, onChange: (roster: VoicePresence[]) => void): Promise<() => void>;
  sendSignal(channelId: string, toPubkey: string, payload: VoiceSignalPayload): Promise<void>;
  subscribeSignals(
    channelId: string,
    selfPubkey: string,
    onSignal: (fromPubkey: string, payload: VoiceSignalPayload) => void,
  ): Promise<() => void>;
}

export function createVoiceTransport(options: VoiceTransportOptions = {}): VoiceTransport {
  return {
    publishPresenceBeacon: (channelId, connectedTo = [], knownPeers = [], videoTracks = []) =>
      publishPresenceBeacon(channelId, connectedTo, knownPeers, videoTracks, options),
    publishLeavePresence: (channelId) => publishLeavePresence(channelId, options),
    subscribeRoster: (channelId, onChange) => subscribeRoster(channelId, onChange, options),
    sendSignal: (channelId, toPubkey, payload) => sendSignal(channelId, toPubkey, payload, options),
    subscribeSignals: (channelId, selfPubkey, onSignal) =>
      subscribeSignals(channelId, selfPubkey, onSignal, options),
  };
}

export function getSelfPubkey(): string | null {
  return getBridgeImpl()?.getPublicKey() ?? null;
}

/**
 * Compute the transitive participant set from a beacon roster.
 *
 * The relay only tells us about publishers we directly received beacons
 * from. To survive dropped beacons, each beacon also lists who its
 * publisher has confirmed live connections with: `connectedTo`, `p` tags.
 * Union those into the publisher set and you get every pubkey known to be
 * in the room.
 *
 * `knownPeers` (`peer` tags) is deliberately left out. It is second-hand:
 * two live clients that each re-advertised the other's `peer` list kept a
 * departed pubkey alive between them forever, and every such ghost cost a
 * 9 s dial timeout and a slot under the four-person cap.
 *
 * Self is included as a transitive hint when other peers list us, but
 * `VoiceClient` always filters `selfPubkey` out before opening peers, so
 * we don't dial ourselves.
 */
export function transitiveParticipants(
  roster: readonly VoicePresence[],
): string[] {
  const set = new Set<string>();
  for (const p of roster) {
    set.add(p.pubkey);
    for (const pk of p.connectedTo) set.add(pk);
  }
  return Array.from(set);
}
