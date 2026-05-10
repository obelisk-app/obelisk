/**
 * Mesh peer discovery — union of two sources:
 *
 *  1. Relay-discovered: presence beacons (kind 20078) flowing through
 *     the Nostr relay. This is the bootstrap path.
 *  2. Control-discovered: peers learned via another peer's data-channel
 *     `hello` / `peerAdded` messages. This is the resilience path —
 *     when A↔B and B↔C have working PCs but C's beacons never reach A
 *     (relay drops, NIP-42 race, throttling), A still discovers C and
 *     can dial directly.
 *
 * Control-derived entries are keyed by `(pubkey, viaPeer)` so a
 * `peerRemoved` from peer A doesn't drop the entry if peer B still
 * claims them. Removal-when-no-claimants prevents flicker on partial
 * partitions.
 *
 * Caller (`VoiceClient.handleRoster`) treats `effectivePeers()` as
 * authoritative for the dial loop; membership filter and capacity cap
 * are applied on top.
 */

export type DiscoverySource = 'relay' | 'control';

export interface PeerAttribution {
  relay: boolean;
  /** Peers that claimed this pubkey via control channel (deduplicated). */
  viaControl: string[];
}

export class DiscoveryEngine {
  private relay = new Set<string>();
  /** pubkey → set of peers that claimed them */
  private control = new Map<string, Set<string>>();

  setRelayDiscovered(pubkeys: ReadonlySet<string> | readonly string[]): void {
    this.relay = new Set(pubkeys);
  }

  addControlDiscovered(pubkey: string, viaPeer: string): boolean {
    if (!pubkey || !viaPeer) return false;
    if (pubkey === viaPeer) return false; // a peer claiming itself is no info
    let set = this.control.get(pubkey);
    if (!set) {
      set = new Set();
      this.control.set(pubkey, set);
    }
    if (set.has(viaPeer)) return false;
    set.add(viaPeer);
    return true;
  }

  removeControlDiscovered(pubkey: string, viaPeer: string): boolean {
    const set = this.control.get(pubkey);
    if (!set) return false;
    const removed = set.delete(viaPeer);
    if (set.size === 0) this.control.delete(pubkey);
    return removed;
  }

  /** Drop all control-derived entries that came via this peer. */
  dropClaimsFromPeer(viaPeer: string): string[] {
    const dropped: string[] = [];
    for (const [pubkey, claimants] of Array.from(this.control.entries())) {
      if (claimants.delete(viaPeer)) {
        if (claimants.size === 0) {
          this.control.delete(pubkey);
          dropped.push(pubkey);
        }
      }
    }
    return dropped;
  }

  effectivePeers(): string[] {
    const out = new Set<string>(this.relay);
    for (const pk of this.control.keys()) out.add(pk);
    return Array.from(out);
  }

  attribution(pubkey: string): PeerAttribution {
    return {
      relay: this.relay.has(pubkey),
      viaControl: Array.from(this.control.get(pubkey) ?? []),
    };
  }

  /** Source-only check — useful for metrics: is this a control-only discovery? */
  source(pubkey: string): { relay: boolean; control: boolean } {
    return {
      relay: this.relay.has(pubkey),
      control: this.control.has(pubkey),
    };
  }

  /** Test introspection — total peers known from any source. */
  size(): number {
    const all = new Set<string>(this.relay);
    for (const pk of this.control.keys()) all.add(pk);
    return all.size;
  }

  reset(): void {
    this.relay.clear();
    this.control.clear();
  }
}
