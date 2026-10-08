/**
 * Room-wide video-slot cap: four cameras and one screen share, resolved
 * deterministically so every client agrees on who holds a slot without a
 * coordinator. Pure functions over the beacon roster and the local claims;
 * `VoiceClient` owns the state and the eviction side effects.
 */
import type { VoicePresence, VideoSlotKind } from '@/types/voice/protocol';
import { MAX_CAMERAS, MAX_SCREEN_SHARES } from '@/constants/voice/client';

export interface VideoSlotClaim {
  pubkey: string;
  kind: VideoSlotKind;
  /** Relay seconds: the beacon's `created_at` for remote claims, the wall clock for ours. */
  claimedAt: number;
}

/**
 * Build the flattened list of every video track currently in the room,
 * local + remote, sorted by `(claimedAt asc, pubkey asc)` so any two
 * clients computing this list independently agree on the leading slice.
 *
 * For remote tracks, `claimedAt` is the publisher's beacon `createdAt`.
 * For local tracks, `claimedAt` is the wall-clock second we acquired
 * the track. They share the same units (relay seconds), so the order
 * is consistent across publishers.
 */
export function buildVideoSlotList(
  roster: readonly VoicePresence[],
  selfPubkey: string,
  localClaims: ReadonlyMap<VideoSlotKind, number>,
): VideoSlotClaim[] {
  const list: VideoSlotClaim[] = [];
  // Remote claims from beacons (excluding self: we use our own track
  // state, not the beacon we published, to avoid a stale beacon claim
  // outliving a track we just stopped).
  for (const presence of roster) {
    if (presence.pubkey === selfPubkey) continue;
    for (const kind of presence.videoTracks) {
      list.push({ pubkey: presence.pubkey, kind, claimedAt: presence.createdAt });
    }
  }
  // Local claims.
  for (const [kind, claimedAt] of localClaims.entries()) {
    list.push({ pubkey: selfPubkey, kind, claimedAt });
  }
  list.sort((a, b) => {
    if (a.claimedAt !== b.claimedAt) return a.claimedAt - b.claimedAt;
    if (a.pubkey !== b.pubkey) return a.pubkey < b.pubkey ? -1 : 1;
    // Same publisher claiming both kinds: 'camera' before 'screen' is
    // arbitrary but deterministic.
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return 0;
  });
  return list;
}

/** The claims that hold a slot: the leading cameras and the leading screen share. */
export function videoSlotWinners(list: readonly VideoSlotClaim[]): VideoSlotClaim[] {
  return [
    ...list.filter((slot) => slot.kind === 'camera').slice(0, MAX_CAMERAS),
    ...list.filter((slot) => slot.kind === 'screen').slice(0, MAX_SCREEN_SHARES),
  ];
}

/** Camera slots in use, capped at the room maximum (the UI disables the button at the cap). */
export function cameraSlotsInUse(list: readonly VideoSlotClaim[]): number {
  return Math.min(list.filter((slot) => slot.kind === 'camera').length, MAX_CAMERAS);
}

export function canClaimVideoSlot(list: readonly VideoSlotClaim[], kind: VideoSlotKind): boolean {
  const limit = kind === 'camera' ? MAX_CAMERAS : MAX_SCREEN_SHARES;
  return list.filter((slot) => slot.kind === kind).length < limit;
}
