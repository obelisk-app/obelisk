/**
 * TypeScript surface of the wasmJs nostrord bridge.
 *
 * Mirror of:
 *   nostrord/composeApp/src/wasmJsMain/kotlin/org/nostr/nostrord/bridge/index.d.ts
 *
 * Keep these two files in sync when extending the @JsExport surface.
 */

export interface JsGroup {
  readonly id: string;
  readonly name: string | null;
  readonly about: string | null;
  readonly picture: string | null;
  /**
   * Server banner (image or animated gif URL). Non-standard NIP-29 extension —
   * carried as a `["banner", <url>]` tag on kind 39000/9002. See
   * docs/server-banner.md.
   */
  readonly banner: string | null;
  readonly isPublic: boolean;
  readonly isOpen: boolean;
  readonly parent: string | null;
  /**
   * `'voice'` when the group's kind 39000 metadata carries a `["t","voice"]`
   * tag — see `src/lib/voice/`. Otherwise `'text'`. We piggyback on the
   * existing NIP-29 metadata flow so a voice channel is "just a group with
   * a voice marker"; the relay needs no special handling.
   */
  readonly kind: 'text' | 'voice';
}

export interface JsMessage {
  readonly id: string;
  readonly pubkey: string;
  readonly content: string;
  readonly createdAt: number;
  readonly kind: number;
  readonly replyToId: string | null;
}

export interface JsUserMetadata {
  readonly pubkey: string;
  readonly name: string | null;
  readonly displayName: string | null;
  readonly picture: string | null;
  readonly about: string | null;
  readonly nip05: string | null;
  readonly banner: string | null;
  readonly lud16: string | null;
  readonly website: string | null;
}

export interface JsReaction {
  readonly id: string;
  readonly pubkey: string;
  readonly emoji: string;
  readonly targetEventId: string;
  readonly createdAt: number;
}

export interface JsDirectMessage {
  readonly id: string;
  /** The other party's pubkey (counterparty), regardless of direction. */
  readonly counterparty: string;
  /** True if the local user authored this message. */
  readonly outgoing: boolean;
  readonly content: string;
  readonly createdAt: number;
}

export type Unsubscribe = () => void;

export interface NostrBridge {
  initialize(): Promise<void>;
  dispose(): void;

  loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void>;
  loginWithNip07(pubkeyHex: string): Promise<void>;
  loginWithBunker(bunkerUrl: string, options?: { onAuthUrl?: (url: string) => void }): Promise<string>;
  /**
   * NIP-46 NostrConnect (QR) flow. Returns a `nostrconnect://` URI to render
   * as a QR code; `waitForConnection()` resolves with the user's pubkey hex
   * once the remote signer connects.
   */
  createNostrConnectSession(options?: {
    relay?: string;
    onAuthUrl?: (url: string) => void;
  }): {
    uri: string;
    waitForConnection: () => Promise<string>;
    cancel: () => void;
  };
  logout(): Promise<void>;
  getPublicKey(): string | null;

  connect(): Promise<void>;
  switchRelay(url: string): Promise<void>;
  addRelay(url: string): Promise<void>;
  removeRelay(url: string): Promise<void>;
  /** All relays the user has configured (the server-rail list). */
  subscribeConfiguredRelays(cb: (urls: ReadonlyArray<string>) => void): Unsubscribe;

  subscribeIsLoggedIn(cb: (v: boolean) => void): Unsubscribe;
  subscribeConnectionState(cb: (label: string) => void): Unsubscribe;
  subscribeCurrentRelayUrl(cb: (url: string) => void): Unsubscribe;
  /**
   * The local user's pubkey hex (from the active session), or `null` when
   * logged out. Reactive: subscribers receive updates on login/logout.
   */
  subscribeMyPubkey(cb: (pubkey: string | null) => void): Unsubscribe;
  /**
   * The active session's login method, or `null` when logged out. Reactive.
   * Used to decide whether to wait for an external NIP-46 bunker signer.
   */
  subscribeMyLoginMethod(cb: (m: 'nsec' | 'nip07' | 'bunker' | null) => void): Unsubscribe;
  /**
   * `true` once the active NIP-46 bunker signer has handshaken with the
   * bunker relay. Pre-warmed during {@link initialize} on page reload.
   * Always `false` for nsec/NIP-07 sessions (those don't have an external
   * signer to wait for) — derive a generic "ready to publish" flag as
   * `(loginMethod !== 'bunker') || bunkerSignerReady`.
   */
  subscribeBunkerSignerReady(cb: (ready: boolean) => void): Unsubscribe;
  subscribeGroups(cb: (groups: ReadonlyArray<JsGroup>) => void): Unsubscribe;
  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe;
  subscribeUserMetadata(pubkey: string, cb: (meta: JsUserMetadata | null) => void): Unsubscribe;
  /** Reactions targeting any event in [groupId]. Keyed by target event id. */
  subscribeReactions(
    groupId: string,
    cb: (byTarget: Readonly<Record<string, ReadonlyArray<JsReaction>>>) => void,
  ): Unsubscribe;
  /** parent group id → set of child group ids (NIP-29 nesting). */
  subscribeChildrenByParent(
    cb: (byParent: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe;
  /** Encrypted DMs (kind 4) involving the local user. Keyed by counterparty pubkey. */
  subscribeDirectMessages(
    cb: (byPeer: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>) => void,
  ): Unsubscribe;
  /** NIP-29 39001 admins (relay-published). Keyed by pubkey hex. */
  subscribeAdmins(groupId: string, cb: (admins: ReadonlyArray<string>) => void): Unsubscribe;
  /** Full admin map for every group the bridge has seen on the active relay. */
  subscribeAdminsByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe;
  /** NIP-29 39002 members (relay-published). */
  subscribeMembers(groupId: string, cb: (members: ReadonlyArray<string>) => void): Unsubscribe;
  /**
   * Fires `true` once the relay has delivered at least one 39001 or 39002
   * event for the group, otherwise `false`. Use as positive evidence the
   * relay has actually responded before treating an empty members list as
   * "not a member" — without this signal, a slow NIP-42 round-trip looks
   * identical to a real non-membership.
   */
  subscribeMembershipReady(groupId: string, cb: (ready: boolean) => void): Unsubscribe;
  /** NIP-02 kind 3 follows for the local user. */
  subscribeMyFollows(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe;

  /**
   * Sign an event template with the active session's signer without
   * publishing it. Intended for HTTP-side flows like Blossom BUD-01 upload
   * auth (kind 24242) where the signed event is passed in the Authorization
   * header rather than to a relay.
   */
  signEventTemplate(template: {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
  }): Promise<{
    id: string;
    pubkey: string;
    kind: number;
    content: string;
    tags: string[][];
    created_at: number;
    sig: string;
  }>;

  sendMessage(groupId: string, content: string, replyTo?: { id: string; pubkey: string } | null): Promise<void>;
  sendReaction(targetEventId: string, targetPubkey: string, emoji: string, groupId: string): Promise<void>;
  sendDirectMessage(recipientPubkey: string, content: string): Promise<void>;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  /** NIP-29 9000 put-user: add a member with optional roles (e.g. ['admin']). */
  putUser(groupId: string, pubkey: string, roles?: ReadonlyArray<string>): Promise<void>;
  /** NIP-29 9001 remove-user. */
  removeUser(groupId: string, pubkey: string): Promise<void>;
  /** NIP-29 9005 delete-event (admin moderation). */
  deleteGroupEvent(groupId: string, eventId: string): Promise<void>;
  /**
   * NIP-29 create-group (kind 9007) followed by an edit-metadata (kind 9002)
   * to set name/about/visibility. Returns the group id (generated if not
   * supplied).
   */
  createGroup(opts: {
    groupId?: string;
    name: string;
    about?: string;
    picture?: string;
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
    /** When `'voice'`, includes a `["t","voice"]` marker on the kind 9002 metadata so the channel renders as a voice/video room. See `src/lib/voice/`. */
    kind?: 'text' | 'voice';
  }): Promise<string>;
  editGroupMetadata(opts: {
    groupId: string;
    name?: string;
    about?: string;
    picture?: string;
    /** Banner image/gif url (custom NIP-29 extension — see docs/server-banner.md). */
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
    /** Toggle a channel between text and voice. Adds or omits the `["t","voice"]` marker on the kind 9002 metadata; the relay reflects it on kind 39000 like any other tag. */
    kind?: 'text' | 'voice';
  }): Promise<void>;
  /**
   * NIP-50 search against the active relay(s). Builds a single `REQ` filter
   * combining the supplied tokens. The relay must advertise NIP-50 support
   * for the `search` field to be honoured; without it most relays will
   * silently ignore the term and return recent matches by tags only.
   */
  searchMessages(opts: {
    query?: string;
    /** Restrict to specific groups (NIP-29 `#h`). */
    groupIds?: ReadonlyArray<string>;
    /** Restrict by author pubkey hex. */
    authors?: ReadonlyArray<string>;
    /** Restrict to messages mentioning these pubkeys (`#p`). */
    mentions?: ReadonlyArray<string>;
    /** Local content filter — keeps messages that contain a url / image url / file-ish url. */
    has?: ReadonlyArray<'link' | 'image' | 'file'>;
    since?: number;
    until?: number;
    limit?: number;
  }): Promise<ReadonlyArray<JsMessage & { groupId: string | null }>>;
  /**
   * Publish a kind:0 metadata event for the logged-in user. Fetches the
   * latest kind:0 first and merges the supplied fields, so unknown keys set
   * by other clients are preserved.
   */
  editUserMetadata(opts: {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    nip05?: string;
    website?: string;
    lud16?: string;
  }): Promise<void>;
  loadMoreMessages(groupId: string): Promise<boolean>;
  markGroupAsRead(groupId: string): void;
  setActiveGroup(groupId: string | null): void;
  /** Fetch kind:0 metadata for a pubkey on demand (used by chat to resolve names lazily). */
  ensureUserMetadata(pubkey: string): void;
}
