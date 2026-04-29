/**
 * Bridge implementation backed by `nostr-tools`.
 *
 * Why a TS implementation rather than the planned KMP→WASM bridge:
 *   The Kotlin/Wasm `@JsExport` constraints in Kotlin 2.2.20 don't allow
 *   exporting non-`external` classes as return types of interop functions
 *   (compile error: "Type 'NostrBridge' cannot be used as return type of
 *   JS interop function. Only external, primitive, string, and function
 *   types are supported"). Building the WASM bridge requires a flat-module
 *   redesign with JSON-string returns or `external interface` types — a
 *   nontrivial rewrite that needs hands-on iteration.
 *
 *   nostr-tools uses the same crypto primitives nostrord uses (secp256k1,
 *   NIP-04 ChaCha-poly hybrid, NIP-44 ChaCha20-Poly1305). The protocol
 *   layer is the same; only the host language differs. Components import
 *   from this single seam, so a future swap to the WASM artifact is
 *   mechanical (replace this file's body).
 *
 *   See `nostrord/composeApp/src/wasmJsMain/.../bridge/README.md` (deleted
 *   when the broken first-draft was reverted) and obeliskord/HANDOFF.md
 *   for the WASM swap recipe.
 */
import { SimplePool, type Filter, type Event as NostrEvent, type EventTemplate, type VerifiedEvent, finalizeEvent, getPublicKey, nip19, nip04 } from 'nostr-tools';
import type {
  NostrBridge,
  JsGroup,
  JsMessage,
  JsUserMetadata,
  JsReaction,
  JsDirectMessage,
  Unsubscribe,
} from './types';

// -- NIP-29 kinds --------------------------------------------------------
const KIND_GROUP_MESSAGE = 9;
const KIND_GROUP_METADATA = 39000;
const KIND_GROUP_JOIN_REQUEST = 9021;
const KIND_GROUP_LEAVE_REQUEST = 9022;
const KIND_USER_METADATA = 0;
const KIND_REACTION = 7;
const KIND_DIRECT_MESSAGE = 4;
const KIND_GROUP_CREATE = 9007;
const KIND_GROUP_EDIT_METADATA = 9002;
const KIND_GROUP_PUT_USER = 9000;
const KIND_GROUP_REMOVE_USER = 9001;
const KIND_GROUP_DELETE_EVENT = 9005;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MEMBERS = 39002;

const STORAGE_KEY = 'obeliskord/session';
const RELAYS_KEY = 'obeliskord/relays';
const DEFAULT_RELAY = 'wss://relay.obelisk.ar';

// Outbox/profile relays for fetching kind:0 metadata. NIP-29 group relays
// generally don't carry user profile events, so we query well-known public
// relays in addition to the active group relay.
const PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

interface PersistedSession {
  privKeyHex?: string;     // optional: only nsec login persists this
  pubKeyHex: string;
  loginMethod: 'nsec' | 'nip07' | 'bunker';
  relayUrl: string;
}

type Listener<T> = (value: T) => void;

class StateStore<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (next === this.value) return;
    this.value = next;
    this.listeners.forEach((l) => l(next));
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(cb: Listener<T>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.value);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

class BridgeImpl implements NostrBridge {
  private pool: SimplePool;
  private relays: string[] = [DEFAULT_RELAY];
  private session: PersistedSession | null = null;
  private subs: Array<{ close: () => void }> = [];
  private activeGroupId: string | null = null;

  constructor() {
    this.pool = this.createPool();
  }

  /**
   * Create a SimplePool with NIP-42 automatic authentication.
   * When the relay sends an AUTH challenge, the pool signs a kind-22242
   * event with the current session key and sends it back automatically.
   */
  private createPool(): SimplePool {
    return new SimplePool({
      automaticallyAuth: (_relayUrl: string) => {
        if (!this.session) return null;
        return async (evt: EventTemplate): Promise<VerifiedEvent> => {
          if (this.session?.loginMethod === 'nsec' && this.session.privKeyHex) {
            const sk = hexToBytes(this.session.privKeyHex);
            return finalizeEvent(evt, sk) as VerifiedEvent;
          }
          if (this.session?.loginMethod === 'nip07') {
            const win = (window as any).nostr;
            if (!win) throw new Error('NIP-07 extension unavailable');
            return (await win.signEvent(evt)) as VerifiedEvent;
          }
          throw new Error('Cannot sign auth event with current login method');
        };
      },
    } as ConstructorParameters<typeof SimplePool>[0]);
  }

  // Reactive state
  isLoggedIn = new StateStore(false);
  connectionState = new StateStore<string>('Disconnected');
  currentRelayUrl = new StateStore<string>(DEFAULT_RELAY);
  configuredRelays = new StateStore<string[]>([DEFAULT_RELAY]);
  groups = new StateStore<JsGroup[]>([]);
  messagesByGroup = new StateStore<Record<string, JsMessage[]>>({});
  userMetadata = new StateStore<Record<string, JsUserMetadata>>({});
  reactionsByGroup = new StateStore<Record<string, Record<string, JsReaction[]>>>({});
  childrenByParent = new StateStore<Record<string, string[]>>({});
  dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  adminsByGroup = new StateStore<Record<string, string[]>>({});
  membersByGroup = new StateStore<Record<string, string[]>>({});
  myFollows = new StateStore<string[]>([]);

  // Pubkeys we've already requested kind:0 for, to avoid duplicate subscriptions.
  private metadataRequested = new Set<string>();
  // Group ids we already have a reaction subscription for.
  private reactionSubscribedGroups = new Set<string>();
  private dmSubscribed = false;
  private adminMemberSubscribedGroups = new Set<string>();

  async initialize(): Promise<void> {
    if (typeof window !== 'undefined') {
      const rawRelays = window.localStorage.getItem(RELAYS_KEY);
      if (rawRelays) {
        try {
          const list = JSON.parse(rawRelays) as string[];
          if (Array.isArray(list) && list.length > 0) {
            this.configuredRelays.set(list);
          }
        } catch {
          // ignore
        }
      }
    }
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      this.session = parsed;
      this.currentRelayUrl.set(parsed.relayUrl);
      // Make sure the session relay is in the configured list.
      this.ensureRelayInList(parsed.relayUrl);
      this.isLoggedIn.set(true);
      await this.connect();
    } catch {
      // bad storage, ignore
    }
  }

  private ensureRelayInList(url: string): void {
    const list = this.configuredRelays.get();
    if (list.includes(url)) return;
    const next = [...list, url];
    this.configuredRelays.set(next);
    this.persistRelays();
  }

  private persistRelays(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RELAYS_KEY, JSON.stringify(this.configuredRelays.get()));
  }

  dispose(): void {
    this.subs.forEach((s) => s.close());
    this.subs = [];
    this.pool.close(this.relays);
  }

  // -- Auth --------------------------------------------------------------

  async loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void> {
    this.session = {
      privKeyHex,
      pubKeyHex,
      loginMethod: 'nsec',
      relayUrl: this.currentRelayUrl.get(),
    };
    this.persist();
    this.isLoggedIn.set(true);
    await this.connect();
  }

  async loginWithNip07(pubkeyHex: string): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).nostr) {
      throw new Error('No NIP-07 browser extension detected');
    }
    this.session = {
      pubKeyHex: pubkeyHex,
      loginMethod: 'nip07',
      relayUrl: this.currentRelayUrl.get(),
    };
    this.persist();
    this.isLoggedIn.set(true);
    await this.connect();
  }

  async loginWithBunker(_bunkerUrl: string): Promise<string> {
    throw new Error('NIP-46 bunker login is not yet implemented in the TS bridge. Use nsec or NIP-07.');
  }

  async logout(): Promise<void> {
    this.session = null;
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    this.dispose();
    this.pool = this.createPool();
    this.isLoggedIn.set(false);
    this.connectionState.set('Disconnected');
    this.groups.set([]);
    this.messagesByGroup.set({});
  }

  getPublicKey(): string | null {
    return this.session?.pubKeyHex ?? null;
  }

  // -- Connection --------------------------------------------------------

  async connect(): Promise<void> {
    this.connectionState.set('Connecting');
    try {
      // SimplePool.subscribe is lazy and synchronous — it doesn't wait for
      // the WebSocket handshake, so previously every relay (even bogus
      // ones) appeared "Connected" instantly. ensureRelay actually awaits
      // the handshake and rejects on timeout / refused / DNS failure.
      await Promise.all(
        this.relays.map(async (url) => {
          validateRelayUrl(url);
          const relay = await this.pool.ensureRelay(url, { connectionTimeout: 5000 });
          if (!relay.connected) throw new Error(`relay ${url} did not complete handshake`);
          // Flip status back if the socket drops later.
          relay.onclose = () => {
            if (this.relays.includes(url)) {
              this.connectionState.set('Disconnected');
            }
          };
        }),
      );
      this.subscribeGroupMetadata();
      this.subscribeIncomingDMs();
      this.subscribeMyContactList();
      // Resolve the user's own profile so the UI has it immediately.
      if (this.session) this.ensureUserMetadata(this.session.pubKeyHex);
      this.connectionState.set('Connected');
    } catch (e: unknown) {
      this.connectionState.set(`Error:${(e as Error).message}`);
      throw e;
    }
  }

  async switchRelay(url: string): Promise<void> {
    this.subs.forEach((s) => s.close());
    this.subs = [];
    this.pool.close(this.relays);
    this.pool = this.createPool();
    this.relays = [url];
    this.currentRelayUrl.set(url);
    this.ensureRelayInList(url);
    if (this.session) this.session.relayUrl = url;
    this.persist();
    this.groups.set([]);
    this.messagesByGroup.set({});
    // Reset per-group caches: they're scoped to one relay.
    this.reactionSubscribedGroups.clear();
    this.adminMemberSubscribedGroups.clear();
    this.metadataRequested.clear();
    this.adminsByGroup.set({});
    this.membersByGroup.set({});
    this.dmSubscribed = false;
    await this.connect();
  }

  async addRelay(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!trimmed) return;
    validateRelayUrl(trimmed);
    // Verify the relay is actually reachable before persisting it. Use a
    // throwaway pool so a failed probe doesn't pollute the live pool's
    // internal relay map, and so we can guarantee the socket is closed.
    const probe = new SimplePool();
    try {
      const relay = await probe.ensureRelay(trimmed, { connectionTimeout: 5000 });
      if (!relay.connected) throw new Error('relay did not complete handshake');
    } finally {
      try { probe.close([trimmed]); } catch { /* ignore */ }
    }
    if (!this.relays.includes(trimmed)) this.relays.push(trimmed);
    this.ensureRelayInList(trimmed);
  }

  async removeRelay(url: string): Promise<void> {
    const list = this.configuredRelays.get().filter((u) => u !== url);
    if (list.length === 0) return; // never empty the rail
    this.configuredRelays.set(list);
    this.persistRelays();
    if (this.currentRelayUrl.get() === url) {
      await this.switchRelay(list[0]);
    }
  }

  subscribeConfiguredRelays(cb: (urls: ReadonlyArray<string>) => void): Unsubscribe {
    return this.configuredRelays.subscribe(cb);
  }

  // -- Subscriptions -----------------------------------------------------

  subscribeIsLoggedIn(cb: (v: boolean) => void): Unsubscribe {
    return this.isLoggedIn.subscribe(cb);
  }
  subscribeConnectionState(cb: (label: string) => void): Unsubscribe {
    return this.connectionState.subscribe(cb);
  }
  subscribeCurrentRelayUrl(cb: (url: string) => void): Unsubscribe {
    return this.currentRelayUrl.subscribe(cb);
  }
  subscribeGroups(cb: (groups: ReadonlyArray<JsGroup>) => void): Unsubscribe {
    return this.groups.subscribe(cb);
  }
  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe {
    this.subscribeGroupMessages(groupId);
    const adapter: Listener<Record<string, JsMessage[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.messagesByGroup.subscribe(adapter);
  }
  subscribeUserMetadata(pubkey: string, cb: (meta: JsUserMetadata | null) => void): Unsubscribe {
    this.ensureUserMetadata(pubkey);
    const adapter: Listener<Record<string, JsUserMetadata>> = (m) => cb(m[pubkey] ?? null);
    return this.userMetadata.subscribe(adapter);
  }

  subscribeReactions(
    groupId: string,
    cb: (byTarget: Readonly<Record<string, ReadonlyArray<JsReaction>>>) => void,
  ): Unsubscribe {
    this.subscribeGroupReactions(groupId);
    const adapter: Listener<Record<string, Record<string, JsReaction[]>>> = (all) =>
      cb(all[groupId] ?? {});
    return this.reactionsByGroup.subscribe(adapter);
  }

  subscribeChildrenByParent(
    cb: (byParent: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.childrenByParent.subscribe(cb);
  }

  subscribeDirectMessages(
    cb: (byPeer: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>) => void,
  ): Unsubscribe {
    if (!this.dmSubscribed) this.subscribeIncomingDMs();
    return this.dmsByPeer.subscribe(cb);
  }

  subscribeMyFollows(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe {
    return this.myFollows.subscribe(cb);
  }

  subscribeAdmins(groupId: string, cb: (admins: ReadonlyArray<string>) => void): Unsubscribe {
    this.subscribeAdminMember(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.adminsByGroup.subscribe(adapter);
  }

  subscribeMembers(groupId: string, cb: (members: ReadonlyArray<string>) => void): Unsubscribe {
    this.subscribeAdminMember(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.membersByGroup.subscribe(adapter);
  }

  ensureUserMetadata(pubkey: string): void {
    if (this.metadataRequested.has(pubkey)) return;
    this.metadataRequested.add(pubkey);
    this.subscribeKind0(pubkey);
  }

  // -- Group operations --------------------------------------------------

  async sendMessage(groupId: string, content: string): Promise<void> {
    const event = await this.signAndPublish({
      kind: KIND_GROUP_MESSAGE,
      content,
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingestMessage(groupId, event);
  }

  async sendReaction(targetEventId: string, targetPubkey: string, emoji: string, groupId: string): Promise<void> {
    const event = await this.signAndPublish({
      kind: KIND_REACTION,
      content: emoji,
      tags: [
        ['e', targetEventId],
        ['p', targetPubkey],
        ['h', groupId],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingestReaction(groupId, event);
  }

  async sendDirectMessage(recipientPubkey: string, content: string): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const cipher = await this.encryptNip04(recipientPubkey, content);
    const event = await this.signAndPublish({
      kind: KIND_DIRECT_MESSAGE,
      content: cipher,
      tags: [['p', recipientPubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
    // Optimistic local ingest — also avoids depending on relay echo of own DMs.
    this.ingestDM(event, content, /*outgoing*/ true, recipientPubkey);
  }

  async joinGroup(groupId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_JOIN_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_LEAVE_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async createGroup(opts: {
    groupId?: string;
    name: string;
    about?: string;
    picture?: string;
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
  }): Promise<string> {
    const groupId = opts.groupId ?? generateGroupId();
    await this.signAndPublish({
      kind: KIND_GROUP_CREATE,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    await this.editGroupMetadata({ ...opts, groupId });
    return groupId;
  }

  async putUser(groupId: string, pubkey: string, roles?: ReadonlyArray<string>): Promise<void> {
    const pTag: string[] = ['p', pubkey];
    if (roles && roles.length > 0) pTag.push(...roles);
    await this.signAndPublish({
      kind: KIND_GROUP_PUT_USER,
      content: '',
      tags: [['h', groupId], pTag],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async removeUser(groupId: string, pubkey: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_REMOVE_USER,
      content: '',
      tags: [['h', groupId], ['p', pubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async deleteGroupEvent(groupId: string, eventId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_DELETE_EVENT,
      content: '',
      tags: [['h', groupId], ['e', eventId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async editGroupMetadata(opts: {
    groupId: string;
    name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
  }): Promise<void> {
    const tags: string[][] = [['h', opts.groupId]];
    if (opts.name !== undefined) tags.push(['name', opts.name]);
    if (opts.about !== undefined) tags.push(['about', opts.about]);
    if (opts.picture !== undefined) tags.push(['picture', opts.picture]);
    if (opts.banner !== undefined) tags.push(['banner', opts.banner]);
    if (opts.isPublic !== undefined) tags.push([opts.isPublic ? 'public' : 'private']);
    if (opts.isOpen !== undefined) tags.push([opts.isOpen ? 'open' : 'closed']);
    await this.signAndPublish({
      kind: KIND_GROUP_EDIT_METADATA,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async searchMessages(opts: {
    query?: string;
    groupIds?: ReadonlyArray<string>;
    authors?: ReadonlyArray<string>;
    mentions?: ReadonlyArray<string>;
    has?: ReadonlyArray<'link' | 'image' | 'file'>;
    since?: number;
    until?: number;
    limit?: number;
  }): Promise<ReadonlyArray<JsMessage & { groupId: string | null }>> {
    const filter: Filter & { search?: string } = {
      kinds: [KIND_GROUP_MESSAGE],
      limit: opts.limit ?? 50,
    };
    if (opts.query && opts.query.trim()) filter.search = opts.query.trim();
    if (opts.authors && opts.authors.length > 0) filter.authors = [...opts.authors];
    if (opts.mentions && opts.mentions.length > 0) (filter as Record<string, unknown>)['#p'] = [...opts.mentions];
    if (opts.groupIds && opts.groupIds.length > 0) (filter as Record<string, unknown>)['#h'] = [...opts.groupIds];
    if (opts.since) filter.since = opts.since;
    if (opts.until) filter.until = opts.until;
    const events = await this.pool.querySync(this.relays, filter, { maxWait: 4000 });
    const has = new Set(opts.has ?? []);
    const URL_RE = /https?:\/\/\S+/i;
    const IMG_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?/i;
    const FILE_RE = /https?:\/\/\S+\.(?:pdf|zip|tar|gz|mp3|mp4|mov|webm|wav|csv|json|txt|md)(?:\?\S*)?/i;
    const matches = (content: string) => {
      if (has.size === 0) return true;
      if (has.has('image') && !IMG_RE.test(content)) return false;
      if (has.has('file') && !FILE_RE.test(content)) return false;
      if (has.has('link') && !URL_RE.test(content)) return false;
      return true;
    };
    return events
      .filter((e) => matches(e.content))
      .map((e) => ({
        id: e.id,
        pubkey: e.pubkey,
        content: e.content,
        createdAt: e.created_at,
        kind: e.kind,
        replyToId: e.tags.find((t) => t[0] === 'e')?.[1] ?? null,
        groupId: e.tags.find((t) => t[0] === 'h')?.[1] ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async editUserMetadata(opts: {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    nip05?: string;
    website?: string;
    lud16?: string;
  }): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const me = this.session.pubKeyHex;
    const profileRelays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));

    let existing: Record<string, unknown> = {};
    try {
      const ev = await this.pool.get(profileRelays, { kinds: [KIND_USER_METADATA], authors: [me] });
      if (ev) existing = JSON.parse(ev.content) as Record<string, unknown>;
    } catch {
      // ignore — start from empty
    }

    const merged: Record<string, unknown> = { ...existing };
    if (opts.name !== undefined) merged.name = opts.name;
    if (opts.displayName !== undefined) merged.display_name = opts.displayName;
    if (opts.about !== undefined) merged.about = opts.about;
    if (opts.picture !== undefined) merged.picture = opts.picture;
    if (opts.banner !== undefined) merged.banner = opts.banner;
    if (opts.nip05 !== undefined) merged.nip05 = opts.nip05;
    if (opts.website !== undefined) merged.website = opts.website;
    if (opts.lud16 !== undefined) merged.lud16 = opts.lud16;

    await this.signAndPublish({
      kind: KIND_USER_METADATA,
      content: JSON.stringify(merged),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async loadMoreMessages(_groupId: string): Promise<boolean> {
    // Pagination not yet implemented — relays return all current messages
    // on initial subscribe via this minimal client. A full implementation
    // tracks the oldest seen `created_at` and re-subscribes with `until`.
    return false;
  }

  markGroupAsRead(_groupId: string): void {
    // No-op in this minimal client. Real impl would persist a per-group
    // last-read timestamp and recompute unread counts.
  }

  setActiveGroup(groupId: string | null): void {
    this.activeGroupId = groupId;
  }

  // -- Internals ---------------------------------------------------------

  /**
   * Return a signing function suitable for `onauth` params in pool.subscribe
   * and pool.publish. When the relay sends CLOSED "auth-required:…" the pool
   * uses this to authenticate and retry the operation automatically.
   */
  private getAuthSigner(): ((evt: EventTemplate) => Promise<VerifiedEvent>) | undefined {
    if (!this.session) return undefined;
    return async (evt: EventTemplate): Promise<VerifiedEvent> => {
      if (this.session?.loginMethod === 'nsec' && this.session.privKeyHex) {
        const sk = hexToBytes(this.session.privKeyHex);
        return finalizeEvent(evt, sk) as VerifiedEvent;
      }
      if (this.session?.loginMethod === 'nip07') {
        const win = (window as any).nostr;
        if (!win) throw new Error('NIP-07 extension unavailable');
        return (await win.signEvent(evt)) as VerifiedEvent;
      }
      throw new Error('Cannot sign auth event with current login method');
    };
  }

  private subscribeGroupMetadata(): void {
    const filter: Filter = { kinds: [KIND_GROUP_METADATA] };
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => this.ingestGroupMetadata(ev),
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private subscribeGroupMessages(groupId: string): void {
    const filter: Filter = {
      kinds: [KIND_GROUP_MESSAGE],
      '#h': [groupId],
      limit: 200,
    };
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => this.ingestMessage(groupId, ev),
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private subscribeKind0(pubkey: string): void {
    const filter: Filter = { kinds: [KIND_USER_METADATA], authors: [pubkey] };
    const relays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    const sub = this.pool.subscribe(relays, filter, {
      onevent: (ev) => this.ingestUserMetadata(ev),
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private subscribeGroupReactions(groupId: string): void {
    if (this.reactionSubscribedGroups.has(groupId)) return;
    this.reactionSubscribedGroups.add(groupId);
    const filter: Filter = { kinds: [KIND_REACTION], '#h': [groupId], limit: 500 };
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => this.ingestReaction(groupId, ev),
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private subscribeAdminMember(groupId: string): void {
    if (this.adminMemberSubscribedGroups.has(groupId)) return;
    this.adminMemberSubscribedGroups.add(groupId);
    const filter: Filter = {
      kinds: [KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS],
      '#d': [groupId],
    };
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => this.ingestAdminMember(ev),
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private ingestAdminMember(ev: NostrEvent): void {
    const groupId = ev.tags.find((t) => t[0] === 'd')?.[1];
    if (!groupId) return;
    const pubkeys = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    const store = ev.kind === KIND_GROUP_ADMINS ? this.adminsByGroup : this.membersByGroup;
    store.update((prev) => ({ ...prev, [groupId]: pubkeys }));
    pubkeys.forEach((pk) => this.ensureUserMetadata(pk));
  }

  private subscribeMyContactList(): void {
    if (!this.session) return;
    const filter: Filter = { kinds: [3], authors: [this.session.pubKeyHex], limit: 1 };
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => {
        const pubkeys = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
        this.myFollows.set(pubkeys);
        pubkeys.forEach((pk) => this.ensureUserMetadata(pk));
      },
      onauth: this.getAuthSigner(),
    });
    this.subs.push(sub);
  }

  private subscribeIncomingDMs(): void {
    if (!this.session || this.dmSubscribed) return;
    this.dmSubscribed = true;
    const me = this.session.pubKeyHex;
    // DMs to me (kind 4 with #p = me) and from me (authored by me).
    const filterIn: Filter = { kinds: [KIND_DIRECT_MESSAGE], '#p': [me], limit: 200 };
    const filterOut: Filter = { kinds: [KIND_DIRECT_MESSAGE], authors: [me], limit: 200 };
    for (const f of [filterIn, filterOut]) {
      const sub = this.pool.subscribe(this.relays, f, {
        onevent: (ev) => this.ingestIncomingDM(ev),
        onauth: this.getAuthSigner(),
      });
      this.subs.push(sub);
    }
  }

  private ingestGroupMetadata(ev: NostrEvent): void {
    const tag = (name: string) => ev.tags.find((t) => t[0] === name)?.[1];
    const groupId = tag('d');
    if (!groupId) return;
    const isPublic = ev.tags.some((t) => t[0] === 'public');
    const isOpen = ev.tags.some((t) => t[0] === 'open');
    const parent = tag('parent') ?? null;
    const next: JsGroup = {
      id: groupId,
      name: tag('name') ?? null,
      about: tag('about') ?? null,
      picture: tag('picture') ?? null,
      banner: tag('banner') ?? null,
      isPublic,
      isOpen,
      parent,
    };
    this.groups.update((prev) => {
      const filtered = prev.filter((g) => g.id !== groupId);
      return [...filtered, next].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    });
    // Maintain parent → children index so the sidebar can render nesting.
    this.childrenByParent.update((prev) => {
      const next: Record<string, string[]> = { ...prev };
      // Remove this groupId from any old parent buckets to handle re-parents.
      for (const k of Object.keys(next)) {
        if (next[k].includes(groupId)) {
          next[k] = next[k].filter((id) => id !== groupId);
        }
      }
      if (parent) {
        const arr = next[parent] ?? [];
        if (!arr.includes(groupId)) next[parent] = [...arr, groupId].sort();
      }
      return next;
    });
  }

  private ingestMessage(groupId: string, ev: NostrEvent): void {
    const replyTo = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const msg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
    };
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
    // Lazy metadata fetch for any author we haven't seen yet.
    this.ensureUserMetadata(ev.pubkey);
  }

  private ingestReaction(groupId: string, ev: NostrEvent): void {
    const targetEventId = ev.tags.find((t) => t[0] === 'e')?.[1];
    if (!targetEventId) return;
    const reaction: JsReaction = {
      id: ev.id,
      pubkey: ev.pubkey,
      emoji: ev.content || '+',
      targetEventId,
      createdAt: ev.created_at,
    };
    this.reactionsByGroup.update((all) => {
      const forGroup = { ...(all[groupId] ?? {}) };
      const existing = forGroup[targetEventId] ?? [];
      if (existing.some((r) => r.id === reaction.id)) return all;
      forGroup[targetEventId] = [...existing, reaction];
      return { ...all, [groupId]: forGroup };
    });
  }

  private async ingestIncomingDM(ev: NostrEvent): Promise<void> {
    if (!this.session) return;
    const me = this.session.pubKeyHex;
    const recipient = ev.tags.find((t) => t[0] === 'p')?.[1];
    const isOutgoing = ev.pubkey === me;
    const counterparty = isOutgoing ? (recipient ?? '') : ev.pubkey;
    if (!counterparty) return;
    let plaintext: string;
    try {
      plaintext = await this.decryptNip04(counterparty, ev.content);
    } catch {
      return; // can't decrypt → skip silently
    }
    this.ingestDM(ev, plaintext, isOutgoing, counterparty);
  }

  private ingestDM(ev: NostrEvent, plaintext: string, outgoing: boolean, counterparty: string): void {
    const dm: JsDirectMessage = {
      id: ev.id,
      counterparty,
      outgoing,
      content: plaintext,
      createdAt: ev.created_at,
    };
    this.dmsByPeer.update((all) => {
      const existing = all[counterparty] ?? [];
      if (existing.some((m) => m.id === dm.id)) return all;
      return {
        ...all,
        [counterparty]: [...existing, dm].sort((a, b) => a.createdAt - b.createdAt),
      };
    });
    this.ensureUserMetadata(counterparty);
  }

  private async encryptNip04(recipientPubkey: string, content: string): Promise<string> {
    if (!this.session) throw new Error('Not logged in');
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      return nip04.encrypt(this.session.privKeyHex, recipientPubkey, content);
    }
    if (this.session.loginMethod === 'nip07') {
      const w = (window as any).nostr;
      if (!w?.nip04?.encrypt) throw new Error('Extension does not support NIP-04 encryption');
      return w.nip04.encrypt(recipientPubkey, content);
    }
    throw new Error('Cannot encrypt with current login method');
  }

  private async decryptNip04(senderPubkey: string, ciphertext: string): Promise<string> {
    if (!this.session) throw new Error('Not logged in');
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      return nip04.decrypt(this.session.privKeyHex, senderPubkey, ciphertext);
    }
    if (this.session.loginMethod === 'nip07') {
      const w = (window as any).nostr;
      if (!w?.nip04?.decrypt) throw new Error('Extension does not support NIP-04 decryption');
      return w.nip04.decrypt(senderPubkey, ciphertext);
    }
    throw new Error('Cannot decrypt with current login method');
  }

  private ingestUserMetadata(ev: NostrEvent): void {
    try {
      const data = JSON.parse(ev.content) as Record<string, unknown>;
      const meta: JsUserMetadata = {
        pubkey: ev.pubkey,
        name: (data.name as string) ?? null,
        displayName: (data.display_name as string) ?? null,
        picture: (data.picture as string) ?? null,
        about: (data.about as string) ?? null,
        nip05: (data.nip05 as string) ?? null,
        banner: (data.banner as string) ?? null,
        lud16: (data.lud16 as string) ?? null,
        website: (data.website as string) ?? null,
      };
      this.userMetadata.update((prev) => ({ ...prev, [ev.pubkey]: meta }));
    } catch {
      // ignore malformed kind:0 content
    }
  }

  private async signAndPublish(template: { kind: number; content: string; tags: string[][]; created_at: number }): Promise<NostrEvent> {
    if (!this.session) throw new Error('Not logged in');

    let event: NostrEvent;
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      const sk = hexToBytes(this.session.privKeyHex);
      event = finalizeEvent({ ...template, pubkey: this.session.pubKeyHex }, sk);
    } else if (this.session.loginMethod === 'nip07') {
      const win = (window as any).nostr;
      if (!win) throw new Error('NIP-07 extension unavailable');
      event = (await win.signEvent({ ...template, pubkey: this.session.pubKeyHex })) as NostrEvent;
    } else {
      throw new Error(`Login method ${this.session.loginMethod} cannot sign events in this build`);
    }

    const results = await Promise.allSettled(
      this.pool.publish(this.relays, event, { onauth: this.getAuthSigner() }),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    if (accepted.length === 0) {
      const reasons = results
        .map((r, i) => {
          if (r.status === 'fulfilled') return null;
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          return `${this.relays[i]}: ${reason}`;
        })
        .filter(Boolean)
        .join('; ');
      throw new Error(`Relay rejected event (kind ${event.kind}). ${reasons || 'no relay accepted'}`);
    }
    return event;
  }

  private persist(): void {
    if (typeof window === 'undefined' || !this.session) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
  }
}

/**
 * Reject obviously-bogus relay URLs *before* opening a WebSocket. Browsers
 * will happily DNS-search single-label hosts (e.g. `pindonga` →
 * `pindonga.<search-domain>`) and corporate networks may serve a captive
 * page on TCP connect, so the WebSocket can occasionally appear to "open"
 * for typos. Require: ws/wss scheme + a hostname containing at least one
 * dot (or a literal IP / localhost).
 */
function validateRelayUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`relay URL must use ws:// or wss:// (got ${parsed.protocol})`);
  }
  const host = parsed.hostname;
  if (!host) throw new Error('relay URL has no hostname');
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':'); // v4 or v6
  const isLocalhost = host === 'localhost';
  if (!isIp && !isLocalhost && !host.includes('.')) {
    throw new Error(`"${host}" is not a valid relay hostname (single-label hosts are not allowed)`);
  }
}

function generateGroupId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Decode an nsec1… bech32 string to (privHex, pubHex). Exported for the LoginModal.
export function decodeNsec(nsec: string): { privKeyHex: string; pubKeyHex: string } {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Not an nsec key');
  const sk = decoded.data as Uint8Array;
  const privKeyHex = Array.from(sk).map((b) => b.toString(16).padStart(2, '0')).join('');
  const pubKeyHex = getPublicKey(sk);
  return { privKeyHex, pubKeyHex };
}

let bridgePromise: Promise<NostrBridge> | null = null;
let bridgeInstance: BridgeImpl | null = null;

export function getBridge(): Promise<NostrBridge> {
  if (!bridgePromise) {
    bridgePromise = (async () => {
      bridgeInstance = new BridgeImpl();
      await bridgeInstance.initialize();
      return bridgeInstance;
    })();
  }
  return bridgePromise;
}

export function getBridgeSync(): NostrBridge | null {
  return bridgeInstance;
}
