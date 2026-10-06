/**
 * The SFU-pushed roster of OTHER participants (self excluded). Maintained
 * by `participantList` (replaces wholesale), `peerJoined` (adds), `peerLeft`
 * (removes). Surfaced via `events.onPeersChange` on every mutation. A peer
 * who leaves takes its forwarded tracks with it (`dropTracksFor`).
 */
import type { SfuClientEvents } from './sfu-types';

export interface SfuPeerRosterHost {
  events: Pick<SfuClientEvents, 'onPeersChange'>;
  /** Close every consumer whose producer originated from `pubkey`. */
  dropTracksFor(pubkey: string): void;
}

export class SfuPeerRoster {
  private peers = new Set<string>();

  constructor(private readonly host: SfuPeerRosterHost) {}

  /**
   * Snapshot of the SFU-pushed peer list (excluding self). The dex
   * mirrors this into `VoiceClient.rosterPubkeys` so React UI re-renders
   * without waiting for the next event tick.
   */
  list(): string[] {
    return [...this.peers];
  }

  clear(): void {
    this.peers.clear();
  }

  /**
   * Authoritative snapshot the SFU pushes when our recv transport opens.
   * Replaces (not merges) so the dex's roster always matches the
   * server's truth even after a reconnect. Anyone we were tracking who
   * isn't in the fresh list has left; drop their forwarded tracks too,
   * otherwise their tile stays black after a server restart.
   */
  onParticipantList(data: unknown): void {
    const { pubkeys } = (data ?? {}) as { pubkeys?: string[] };
    const next = new Set<string>();
    for (const pk of pubkeys ?? []) {
      if (typeof pk === 'string' && pk.length > 0) next.add(pk);
    }
    for (const prev of this.peers) {
      if (!next.has(prev)) this.host.dropTracksFor(prev);
    }
    this.peers = next;
    this.emitPeersChange();
  }

  onPeerJoined(data: unknown): void {
    const { pubkey } = (data ?? {}) as { pubkey?: string };
    if (!pubkey) return;
    if (this.peers.has(pubkey)) return;
    this.peers.add(pubkey);
    this.emitPeersChange();
  }

  onPeerLeft(data: unknown): void {
    const { pubkey } = (data ?? {}) as { pubkey?: string };
    if (!pubkey) return;
    const removed = this.peers.delete(pubkey);
    // Prune any tracks the SFU was forwarding from this peer. The server
    // SHOULD also fire `producerClosed` for each producer, but in practice
    // an abrupt disconnect (tab close, network loss, kicked) lands `peerLeft`
    // without the per-producer follow-ups, and without this pruning the
    // peer's video tile stays as the last frame (a black rectangle once
    // the WebRTC timeout drains the jitter buffer).
    this.host.dropTracksFor(pubkey);
    if (removed) this.emitPeersChange();
  }

  private emitPeersChange(): void {
    try {
      this.host.events.onPeersChange?.([...this.peers]);
    } catch (err) {
      console.warn('[sfu] onPeersChange handler threw', err);
    }
  }
}
