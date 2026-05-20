/**
 * TypeScript surface of the wasmJs nostrord bridge.
 *
 * Mirror of:
 *   nostrord/composeApp/src/wasmJsMain/kotlin/org/nostr/nostrord/bridge/index.d.ts
 *
 * Keep these two files in sync when extending the @JsExport surface.
 */

export interface JsForumTag {
  /** Short opaque slug. Stable across edits — threads reference this id. */
  readonly id: string;
  readonly name: string;
  /** Single emoji char (or short pictograph). `null` when the admin didn't set one. */
  readonly emoji: string | null;
}

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
   * Channel variant marker carried as a `["t",<kind>]` tag on kind 39000
   * metadata. `'voice'` → small mesh call (see `src/lib/voice/`);
   * `'voice-sfu'` → big-room call that prefers SFU routing (same UI surface
   * as `'voice'`, but the channel signals to operators "expect ≥10 people,
   * spin up an SFU"); `'forum'` → container channel whose "posts" are
   * themselves child NIP-29 groups — see `ForumView.tsx`. `'text'` is the
   * default for channels with no `t` marker, so existing groups keep
   * rendering as regular chat. The relay needs no special handling — the
   * marker is just another tag.
   */
  readonly kind: 'text' | 'voice' | 'voice-sfu' | 'forum';
  /**
   * Curated forum tags. Only meaningful when `kind === 'forum'` — defined by
   * the forum's admin and carried as `["forum-tag", id, name, emoji?]` tags
   * on the container's kind 9002/39000 metadata. Threads under the forum
   * reference these by id via their own `topics` field. Empty for non-forum
   * channels (and for forums that haven't defined any tags yet).
   */
  readonly forumTags: ReadonlyArray<JsForumTag>;
  /**
   * Topic ids this thread is tagged with — references entries in the parent
   * forum container's `forumTags`. Carried as `["topic", id]` tags on the
   * thread's kind 9002/39000 metadata. Empty for channels that aren't a
   * forum thread or that the OP didn't tag.
   */
  readonly topics: ReadonlyArray<string>;
}

export interface JsMessage {
  readonly id: string;
  readonly pubkey: string;
  readonly content: string;
  readonly createdAt: number;
  readonly kind: number;
  readonly replyToId: string | null;
  /**
   * Pubkeys (hex) explicitly tagged or referenced by this message. Computed
   * once at ingest from `extractMentionPubkeysFromMessage(content, tags)` —
   * the union of `nostr:npub…` tokens in content and `["p", <hex>]` tags.
   * Empty array when there are none.
   */
  readonly mentions: ReadonlyArray<string>;
  /**
   * NIP-30 custom emoji tags carried on the source event, normalized as
   * shortcode name -> image URL. Renderers merge this with the relay's
   * current emoji set so older messages stay portable even if the relay list
   * changes later.
   */
  readonly customEmojis?: Readonly<Record<string, string>>;
  /**
   * Optimistic-send fields. Present only on placeholders the bridge inserted
   * for an in-flight or just-failed publish from this client. Once the relay
   * echo ingest replaces the placeholder, all three are absent.
   *
   * - `pending: true` while {@link NostrBridge.sendMessage} is awaiting the
   *   relay ack — render the bubble grayed out with a spinner.
   * - `failed: true` after the publish rejected — keep the bubble visible and
   *   surface a retry button bound to {@link NostrBridge.retryMessage}.
   * - `clientTag` is the opaque id used by the bridge to correlate retries
   *   and cancellations (also embedded as the message `id` in the form
   *   `pending:<tag>` so React key props stay stable across the lifecycle).
   */
  readonly pending?: boolean;
  readonly failed?: boolean;
  readonly clientTag?: string;
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
  /** NIP-30 custom emoji tags carried on the reaction event. */
  readonly customEmojis?: Readonly<Record<string, string>>;
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
  /**
   * Optimistic-send fields, set only on outgoing placeholders the bridge
   * inserted for an in-flight or failed publish. See {@link JsMessage} for
   * the full contract; same semantics here.
   */
  readonly pending?: boolean;
  readonly failed?: boolean;
  readonly clientTag?: string;
}

export type Unsubscribe = () => void;

/**
 * Per-relay access state, surfaced from NIP-42 AUTH callbacks, CLOSED reasons,
 * and publish rejections.
 * - `'unknown'`        — no signal yet (still connecting, or relay hasn't responded)
 * - `'authenticating'` — relay sent a NIP-42 AUTH challenge; signer is being asked
 *   to sign a kind 22242 event.
 * - `'ok'`             — relay delivered an event/EOSE; reads are flowing
 * - `'auth-required'`  — relay requires NIP-42 AUTH and our signer didn't satisfy it
 *   (signer never ran, was rejected by user, or relay still refused after sign)
 * - `'restricted'`     — relay accepted AUTH but refused us (e.g. pubkey not whitelisted)
 * - `'unreachable'`    — WebSocket handshake failed (DNS, refused, timeout, TLS) or
 *   the socket dropped after connecting and the reconnect attempts are still failing.
 *   Distinct from `'error'` so the UI can say "Cannot reach {host}" instead of
 *   "Relay rejected the request".
 * - `'error'`          — relay sent an unrecognized rejection (publish or subscribe)
 */
export type RelayAccessState =
  | 'unknown'
  | 'authenticating'
  | 'ok'
  | 'auth-required'
  | 'restricted'
  | 'unreachable'
  | 'error';

/**
 * Per-group confidence enum for the kind 9 messages stream. See
 * `subscribeMessagesStatus` for the contract.
 */
export type MessagesStatus =
  | 'loading'
  | 'empty-unconfirmed'
  | 'empty-confirmed'
  | 'has-messages';

export interface NostrBridge {
  initialize(): Promise<void>;
  dispose(): void;

  loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void>;
  loginWithNip07(pubkeyHex: string): Promise<void>;
  loginWithBunker(
    bunkerUrl: string,
    options?: { onAuthUrl?: (url: string) => void; clientSecretHex?: string },
  ): Promise<string>;
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

  /**
   * Per-relay access state (NIP-42 auth + whitelist signal). Keyed by
   * normalized relay URL (lowercase, trailing slash stripped). The bridge
   * only updates this for the currently-active relay — auxiliary relays
   * (profile lookup, NostrConnect, NIP-65 DM) don't surface here.
   */
  subscribeRelayAccess(cb: (byRelay: Readonly<Record<string, RelayAccessState>>) => void): Unsubscribe;

  /**
   * Resolve once the **current** relay reports `'ok'` (NIP-42 AUTH
   * completed and the first read succeeded), or after `timeoutMs`
   * elapses. Always resolves — never rejects. Returns `'ok'` on
   * success, the relay's terminal access state on timeout, or
   * `'timeout'` if no state was recorded yet. Used by mesh voice to
   * delay the first beacon until AUTH is complete.
   */
  waitForRelayAuth(timeoutMs: number): Promise<'ok' | 'timeout' | RelayAccessState>;

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
  subscribeGroupMetadataEose(cb: (eose: boolean) => void): Unsubscribe;
  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe;
  /** Whole `messagesByGroup` map. Used by total-unread selectors that need to
   *  iterate every channel without calling `subscribeMessages` per group. */
  subscribeMessagesByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<JsMessage>>>) => void,
  ): Unsubscribe;
  /**
   * Fires `true` once the relay has emitted EOSE for the per-group kind 9
   * REQ. Used by the chat pane to swap a loading spinner for the welcome /
   * empty state — without this signal, an empty `messagesByGroup[groupId]`
   * looks the same whether the relay is still serving history or has
   * already confirmed the channel is empty.
   *
   * Prefer {@link subscribeMessagesStatus} for new code: EOSE alone is not
   * proof of emptiness on auth-gated relays. The status enum surfaces the
   * bridge's retry-backed confidence so the UI never prematurely declares
   * "No messages".
   */
  subscribeMessagesEose(groupId: string, cb: (eose: boolean) => void): Unsubscribe;
  /**
   * Confidence enum for the per-group kind 9 messages stream.
   *
   *  - `loading`           — REQ open, no EOSE yet, no events ingested
   *  - `empty-unconfirmed` — relay sent EOSE before any events; retries pending
   *  - `empty-confirmed`   — retries exhausted, relay agrees the channel is empty
   *  - `has-messages`      — at least one event ingested
   *
   * The UI should show a loading spinner for `loading` / `empty-unconfirmed`
   * and only render "No messages yet" once the status reaches
   * `empty-confirmed`. The bridge owns the retry timing (see
   * `EMPTY_RETRY_DELAYS` in client.ts) so consumers never need to hand-roll
   * dwell windows.
   */
  subscribeMessagesStatus(
    groupId: string,
    cb: (status: MessagesStatus) => void,
  ): Unsubscribe;
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
  /** Full members map for every group the bridge has seen on the active relay. */
  subscribeMembersByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe;
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
   * NIP-51 kind 10000 mute list (public `p` tags) for the local user. UI
   * consumers should hide messages and DMs from these pubkeys.
   */
  subscribeMyMutes(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe;
  /**
   * Obelisk SFU active-call announcements (kind 31314). Map of
   * `channelId → { hostPubkey, status, expiresAt, createdAt }`. Populated
   * from the SFU's periodic publishes; the relay channel sidebar reads
   * this to render "LIVE" badges on voice channels with a call in
   * progress, even for users who aren't joined.
   */
  subscribeActiveCallByChannel(
    cb: (byChannel: Readonly<Record<string, { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number; mode?: 'sfu' | 'mesh'; participantPubkeys?: string[] }>>) => void,
  ): Unsubscribe;
  /**
   * Add or remove a pubkey from the local user's NIP-51 mute list. Fetches
   * the latest kind 10000 to preserve unrelated entries, then republishes
   * with the adjusted `p` tags.
   */
  setMuted(pubkey: string, muted: boolean): Promise<void>;

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

  /**
   * Insert an optimistic kind 9 placeholder into `messagesByGroup` and kick
   * off the relay publish in the background. Resolves as soon as the
   * placeholder is in the store — the publish completes (success or failure)
   * asynchronously and updates the placeholder via `pending`/`failed` flags
   * (see {@link JsMessage}). Throws synchronously only when there is no
   * active session.
   */
  sendMessage(
    groupId: string,
    content: string,
    replyTo?: { id: string; pubkey: string } | null,
    emojiTags?: ReadonlyArray<ReadonlyArray<string>>,
  ): Promise<void>;
  sendReaction(
    targetEventId: string,
    targetPubkey: string,
    emoji: string,
    groupId: string,
    emojiTags?: ReadonlyArray<ReadonlyArray<string>>,
  ): Promise<void>;
  /** NIP-09 kind 5 deletion for the local user's kind 7 reaction event. */
  removeReaction(groupId: string, reactionEventId: string): Promise<void>;
  /** NIP-09 kind 5 deletion for the local user's kind 9 message event. */
  removeMessage(groupId: string, eventId: string): Promise<void>;
  /**
   * Same optimistic contract as {@link sendMessage}, for NIP-04 DMs. The
   * placeholder is added under the recipient pubkey in `dmsByPeer`; the
   * NIP-04 encrypt + NIP-65 read-relay lookup happen in the background
   * publish task.
   */
  sendDirectMessage(recipientPubkey: string, content: string): Promise<void>;
  /**
   * Re-publish a previously-failed group message. `clientTag` is the same
   * opaque tag exposed on the failed {@link JsMessage}. Flips the
   * placeholder back to `pending` and resolves once the new publish task is
   * scheduled.
   */
  retryMessage(groupId: string, clientTag: string): Promise<void>;
  /** Same as {@link retryMessage} for failed DM placeholders. */
  retryDirectMessage(counterparty: string, clientTag: string): Promise<void>;
  /**
   * Drop a pending or failed group message placeholder from the store.
   * Use this for the user-initiated dismiss action on a failed bubble.
   * No-op if the tag is unknown.
   */
  cancelPendingMessage(groupId: string, clientTag: string): void;
  /** Same as {@link cancelPendingMessage} for DM placeholders. */
  cancelPendingDirectMessage(counterparty: string, clientTag: string): void;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  /**
   * NIP-29 9000 put-user: add a member with optional roles (e.g. ['admin']).
   * Pass `{ quiet: true }` for best-effort background writes (lazy member
   * self-add, etc.) so the activity-bar lifecycle is suppressed.
   */
  putUser(
    groupId: string,
    pubkey: string,
    roles?: ReadonlyArray<string>,
    opts?: { quiet?: boolean },
  ): Promise<void>;
  /** NIP-29 9001 remove-user. */
  removeUser(groupId: string, pubkey: string): Promise<void>;
  /**
   * NIP-29 9003 remove-permission. Strips one or more roles (e.g. `['admin']`)
   * from a member without removing them from the group. Use to demote.
   */
  removePermission(
    groupId: string,
    pubkey: string,
    permissions: ReadonlyArray<string>,
  ): Promise<void>;
  /**
   * One-shot kind 9000 `['admin']` claim, idempotent. No-ops if the local
   * user is not the kind 9007 creator of the group or is already in the
   * relay-published 39001 admin list. Returns `true` if a publish occurred.
   */
  claimCreatorAdmin(groupId: string): Promise<boolean>;
  /**
   * Map of `groupId -> creator pubkey hex` derived from kind 9007 events.
   * Reactive so consumers can detect "I created this channel" without an
   * extra round-trip.
   */
  subscribeGroupCreators(cb: (byGroup: Readonly<Record<string, string>>) => void): Unsubscribe;
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
    /** When `'voice'` / `'forum'`, includes a `["t",<kind>]` marker on the kind 9002 metadata. See `src/lib/voice/` and ForumView. */
    kind?: 'text' | 'voice' | 'voice-sfu' | 'forum';
    /**
     * NIP-29 nesting: parent group id. When set, the relay records this
     * group as a child of `parent` and the bridge surfaces it via
     * `subscribeChildrenByParent`. Used for forum threads (each thread is a
     * child group of its forum container).
     */
    parent?: string;
    /**
     * Forum-container tags (admin-curated). Emits one
     * `["forum-tag", id, name, emoji?]` tag per entry. Only meaningful when
     * `kind === 'forum'` — ignored for other channel kinds.
     */
    forumTags?: ReadonlyArray<JsForumTag>;
    /**
     * Topic ids this thread is tagged with — references entries in the
     * parent forum container's `forumTags`. Emits one `["topic", id]` tag
     * per entry. Only meaningful when `parent` points at a forum container.
     */
    topics?: ReadonlyArray<string>;
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
    /** Toggle a channel's variant. Adds or omits the `["t",<kind>]` marker on the kind 9002 metadata; the relay reflects it on kind 39000 like any other tag. */
    kind?: 'text' | 'voice' | 'voice-sfu' | 'forum';
    /** NIP-29 parent group id (for nesting / forum threads). */
    parent?: string;
    /**
     * Replace the forum container's curated tag set. NIP-29 9002 is a full
     * replacement, so callers must pass the full intended set on every edit
     * — pass `[]` to clear, omit to drop them. Each entry emits a
     * `["forum-tag", id, name, emoji?]` tag.
     */
    forumTags?: ReadonlyArray<JsForumTag>;
    /**
     * Replace the thread's topic ids. Each entry emits a `["topic", id]`
     * tag. Pass `[]` to clear, omit to drop them.
     */
    topics?: ReadonlyArray<string>;
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
  /**
   * Close the existing kind 9 subscription for `groupId` and open a fresh
   * one. Use when a stale EOSE-empty state may be hiding real messages —
   * e.g. user reopens a channel that looked empty after auth-gated /
   * silent-filtering relay behavior.
   */
  refreshGroupMessages(groupId: string): void;
  /**
   * Focused fetch of a single group's kind 39000 metadata. Use when the
   * chat pane mounts on a `groupId` not yet in the bridge's `groups`
   * store — guarantees the channel is fetched even if the global metadata
   * stream missed it for this session. Resolves `true` if at least one
   * previously-unseen 39000 event was ingested.
   */
  fetchGroupMetadata(groupId: string): Promise<boolean>;
  setActiveGroup(groupId: string | null): void;
  /** Fetch kind:0 metadata for a pubkey on demand (used by chat to resolve names lazily). */
  ensureUserMetadata(pubkey: string): void;
}
