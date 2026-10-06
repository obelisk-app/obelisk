/**
 * What the beacons and the active-call hints have told a mesh session:
 * the latest roster snapshot, the pseudo-members it marks (SFUs, mesh
 * test peers), and the passive participant hints from the bridge's kind
 * 20078 watcher. Pure knowledge: it decides nothing and dials nobody.
 * `MeshSession` reads it on every signal, dial and beacon.
 */
import type { VoicePresence } from './types';

export class MeshRoster {
  /**
   * Pubkeys that have published a beacon with `["sfu","1"]` for this
   * channel. SFUs are infrastructure, not participants: they are trusted
   * through the membership filter without operators having to add the
   * SFU's pubkey to every channel's NIP-29 member list. The SFU's signed
   * beacon is the credential; the SFU's own allow-list (config-side)
   * gates who can actually start calls on it.
   *
   * Refreshed on every snapshot: when the SFU's beacon expires, its pubkey
   * leaves this set on the next sweep.
   *
   * Trust caveat: a malicious actor could publish a beacon with
   * `["sfu","1"]` to claim SFU status. The hardening pair is the SFU's
   * kind 31314 active-call event (only published when an authorized host
   * actually started a call); v0 trusts the beacon flag alone.
   */
  private knownSfuPubkeys = new Set<string>();
  private knownMeshTestPeerPubkeys = new Set<string>();
  /**
   * Passive active-call participants from the bridge's global kind 20078
   * watcher. A fallback bootstrap source for the joined mesh client: if
   * the dedicated roster subscription misses an ephemeral beacon, the UI's
   * live-call detector can still hand us the pubkeys it already sees.
   */
  private passiveParticipantHints = new Set<string>();
  /**
   * Latest beacon-roster snapshot for this channel. Read for the room-wide
   * video-slot count while local video is starting / running.
   */
  private currentRoster: readonly VoicePresence[] = [];

  constructor(private readonly selfPubkey: string) {}

  isKnownSfu(pubkey: string): boolean { return this.knownSfuPubkeys.has(pubkey); }
  isKnownMeshTestPeer(pubkey: string): boolean { return this.knownMeshTestPeerPubkeys.has(pubkey); }
  hasPassiveHint(pubkey: string): boolean { return this.passiveParticipantHints.has(pubkey); }
  roster(): readonly VoicePresence[] { return this.currentRoster; }
  hints(): ReadonlySet<string> { return this.passiveParticipantHints; }

  /**
   * Take a roster snapshot. The known-SFU set is refreshed BEFORE anyone
   * runs the membership filter so SFU beacons survive `isMember` even when
   * the SFU isn't in the channel's NIP-29 member list (auto-trust is
   * intentional: operators shouldn't babysit the member list every time
   * they spin up an SFU). Returns the mesh test peers this snapshot
   * revealed for the first time, so the session can rebuild any `Peer` it
   * had already opened to them on the wrong side of the negotiation.
   */
  ingest(roster: readonly VoicePresence[]): { newMeshTestPeers: string[] } {
    this.currentRoster = roster;
    this.knownSfuPubkeys = new Set(roster.filter((r) => r.isSfu).map((r) => r.pubkey));
    const previous = this.knownMeshTestPeerPubkeys;
    this.knownMeshTestPeerPubkeys = new Set(roster.filter((r) => r.isMeshTestPeer).map((r) => r.pubkey));
    const newMeshTestPeers = Array.from(this.knownMeshTestPeerPubkeys).filter((pk) => !previous.has(pk));
    return { newMeshTestPeers };
  }

  /**
   * Replace (or, with `merge`, extend) the passive hints. Self, malformed
   * keys and case differences are normalised away. Returns whether the set
   * changed, so the caller only re-dials and re-announces on a real change.
   */
  setPassiveHints(pubkeys: readonly string[], merge: boolean): boolean {
    const next = merge ? new Set(this.passiveParticipantHints) : new Set<string>();
    for (const pk of pubkeys) {
      if (!pk || pk === this.selfPubkey) continue;
      if (!/^[0-9a-f]{64}$/i.test(pk)) continue;
      next.add(pk.toLowerCase());
    }
    const before = Array.from(this.passiveParticipantHints).sort().join('|');
    const after = Array.from(next).sort().join('|');
    if (before === after) return false;
    this.passiveParticipantHints = next;
    return true;
  }

  /**
   * Mesh pubkeys we have observed *ourselves*: connected PCs, live beacons
   * we received, and active-call hints (also beacons). This set is what we
   * gossip as `peer` tags and `peerSnapshot` messages.
   *
   * It must not include `discovery.effectivePeers()`: that folds in other
   * clients' gossip, so two live clients re-advertised each other's lists
   * and a departed pubkey never aged out; it cost a 9 s dial timeout per
   * redial and a slot under MAX_PARTICIPANTS, until real joiners got
   * `room-full`.
   */
  knownPubkeys(connected: ReadonlySet<string>, isMember: (pubkey: string) => boolean): string[] {
    const known = new Set<string>();
    for (const pk of connected) known.add(pk);
    for (const p of this.currentRoster) known.add(p.pubkey);
    for (const pk of this.passiveParticipantHints) known.add(pk);
    known.delete(this.selfPubkey);
    return Array.from(known).filter(isMember).sort();
  }

  /** Forget the roster and the hints; the SFU set is refreshed by the next snapshot. */
  forget(): void {
    this.currentRoster = [];
    this.knownMeshTestPeerPubkeys.clear();
    this.passiveParticipantHints.clear();
  }
}
