/**
 * Who may be in a voice room: the channel's NIP-29 member (kind 39002) and
 * admin (kind 39001) lists, its `["open"]` flag from kind 39000, and the
 * pseudo-members a mesh session admits on its own (SFUs, mesh test peers,
 * active-call hints). The client owns one of these and asks it on every
 * beacon, signal and dial; the mesh session supplies the pseudo-members.
 *
 * It decides, it never acts: evicting a peer who stopped being a member is
 * the client's job, because tearing down a `Peer` is a topology concern.
 */

/** The pseudo-members a mesh session admits by their signed beacons. */
export interface PseudoMembers {
  /** Its signed `["sfu","1"]` beacon is the credential. */
  isKnownSfu(pubkey: string): boolean;
  /** Operator-spawned diagnostics, marked in their beacon. */
  isKnownMeshTestPeer(pubkey: string): boolean;
  /** Seen by the bridge's kind 20078 live-call detector. */
  hasPassiveHint(pubkey: string): boolean;
}

export interface RoomMembershipOptions {
  members?: readonly string[];
  admins?: readonly string[];
  open?: boolean;
}

export class RoomMembership {
  private members: ReadonlySet<string>;
  private admins: ReadonlySet<string>;
  /**
   * Mutable so the live client can pick up a channel flipping open and
   * closed without being torn down. NIP-29 admins occasionally republish
   * kind 39000 with a different `["open"]` state and any in-call peers
   * should follow.
   */
  private openRoom: boolean;

  constructor(private readonly selfPubkey: string, options: RoomMembershipOptions = {}) {
    this.members = new Set(options.members ?? []);
    this.admins = new Set(options.admins ?? []);
    // Honor the explicit `open` flag from kind 39000 first. Falling back
    // to "no members provided" preserves the dev / ad-hoc-room behavior
    // but is no longer the only path: production callers wire the
    // group's `isOpen` through so an open public channel doesn't reject
    // non-members just because their kind 9000 hasn't landed locally.
    this.openRoom = options.open === true
      || !options.members
      || options.members.length === 0;
  }

  /** True when anyone may join regardless of the member and admin lists. */
  get open(): boolean {
    return this.openRoom;
  }

  /**
   * Flip the open-room flag. Returns whether it changed, so the caller
   * knows whether to re-run the dial loop (opening) or the membership
   * trim (closing). Without a runtime flip an early gate decision would
   * permanently freeze the openness state and either over-restrict (drop
   * every remote peer because the member list hadn't propagated yet) or
   * under-restrict.
   */
  setOpen(open: boolean): boolean {
    if (this.openRoom === open) return false;
    this.openRoom = open;
    return true;
  }

  /** Replace the trusted member and admin lists. */
  update(members: readonly string[], admins: readonly string[]): void {
    this.members = new Set(members);
    this.admins = new Set(admins);
  }

  /** True when the local user is allowed to publish a beacon. */
  canJoin(): boolean {
    return this.openRoom || this.members.has(this.selfPubkey) || this.admins.has(this.selfPubkey);
  }

  /**
   * Whether `pubkey` may be dialed, answered and listed. Admins count as
   * members for connectivity: kind 39001 doesn't always duplicate into
   * 39002, so checking only `members` would tear down legitimate admin
   * peers on every role update.
   */
  isMember(pubkey: string, pseudo: PseudoMembers): boolean {
    // SFUs are pseudo-members: their signed beacon is the credential.
    // This avoids forcing operators to add every SFU they want to use
    // to every channel's NIP-29 member list. The filter is the same on
    // the signaling path so the SFU's offers/answers/ICE aren't dropped.
    if (pseudo.isKnownSfu(pubkey)) return true;
    // Operator-spawned mesh test peers are diagnostics, not room members.
    // Once their signed beacon marks them as a mesh test peer, admit them
    // for any local user who can join this call. The join gate still
    // enforces NIP-29 membership/open-room access for the browser user,
    // but the test peer itself does not need to be duplicated into every
    // member list.
    if (pseudo.isKnownMeshTestPeer(pubkey) && this.canJoin()) return true;
    // The bridge-level active-call detector is driven by signed kind 20078
    // beacons on this channel. Treat those pubkeys as provisional mesh
    // members while the local user is allowed to join, so a slow/stale
    // NIP-29 member snapshot cannot open a peer and then immediately
    // evict it before SDP/ICE completes.
    if (pseudo.hasPassiveHint(pubkey) && this.canJoin()) return true;
    return this.openRoom || this.members.has(pubkey) || this.admins.has(pubkey);
  }

  isAdmin(pubkey: string): boolean {
    return this.admins.has(pubkey);
  }
}
