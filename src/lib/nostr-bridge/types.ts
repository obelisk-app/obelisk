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
  loginWithBunker(bunkerUrl: string): Promise<string>;
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
  /** NIP-29 39002 members (relay-published). */
  subscribeMembers(groupId: string, cb: (members: ReadonlyArray<string>) => void): Unsubscribe;
  /** NIP-02 kind 3 follows for the local user. */
  subscribeMyFollows(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe;

  sendMessage(groupId: string, content: string): Promise<void>;
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
