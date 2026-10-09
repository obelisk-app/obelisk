/**
 * The encrypted DM store: decrypted direct messages kept on this device,
 * only as AES-256-GCM ciphertext, and opened at most once per page session,
 * when the person asks for their DMs.
 *
 * ## Locked, unlocking, unlocked
 *
 * A page starts **locked**. Nothing DM-related is decrypted and the signer
 * is not asked: kind 4 events and gift wraps that arrive are held here as
 * they came off the relay (`hold`), and the read-state sync's gift wraps
 * wait too (`defer`). The bell learns only what is visible without a key
 * (`lock.unopened`, the held wraps the store does not already have).
 *
 * That count waits for the store's index (`loadIndex`, the stored wire ids,
 * read from IndexedDB when the account is attached). The relays replay every
 * wrap on load, often before the index is read; counted then, each message
 * already stored would show as new until the read landed. So nothing is
 * counted until the index is in, and `unlock()` waits for it too.
 *
 * `unlock()` runs when a DM surface opens (`DmUnlock`). It costs one signer
 * call: unwrapping the DM key (`store-key.ts`), or wrapping a new one the
 * first time on this device. The stored messages are then decrypted here,
 * with no signer, and put back into their threads; the held events go to
 * their ingest, which skips every one the store already holds; and from
 * then on every new message is saved as it is opened (`save`).
 *
 * ## What is trusted
 *
 * The store's own index (its record keys, the wire ids) says which wraps
 * were opened, so the inbox never sends those to the signer again. A box
 * that does not open (tampered, or written under a lost key) is deleted, so
 * its wire id is unknown again and the relay's copy is decrypted afresh.
 *
 * ## Without IndexedDB
 *
 * Unlocking needs no key and nothing is written: DMs work for the visit in
 * memory only, as the session vault does.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { importRecordKey, newRecordKeyBytes, openRecord, sealRecord } from '@/lib/crypto/record-cipher';
import { StateStore } from '../common/state-store';
import { dmStoreDb, pageIndexedDb, type DmStoreDb } from './store-db';
import { isWrappedDmKey, unwrapDmKey, wrapDmKey, type WrappedDmKey } from './store-key';
import { decodeRecord, encodeRecord, recordAad } from './store-record';
import type { IngestDmParams } from './thread';
import { MAX_HELD, MAX_DEFERRED } from '@/constants/nostr-bridge/dm';

export type DmLockStatus = 'locked' | 'unlocking' | 'unlocked' | 'failed';

export interface DmLockState {
  readonly status: DmLockStatus;
  /** Held messages still being opened after the local storage key was unlocked. */
  readonly pendingDecryptions?: number;
  /** Created-at (unix ms) of each gift wrap held while locked that the store does not hold. */
  readonly unopened: ReadonlyArray<number>;
}

export type HeldKind = 'wrap' | 'nip04';

const LOCKED: DmLockState = { status: 'locked', unopened: [] };

export interface DmStoreDeps {
  /** The session's signer, for the key; null when logged out. */
  nipSigner(): NipSigner | null;
  /** Put one stored message back into its thread: no signer, no chime. */
  replay(params: IngestDmParams): void;
  /** Hand an event held while locked back to its ingest. */
  reingest(ev: NostrEvent, kind: HeldKind): void | Promise<void>;
  /** DMs are turned on (the opt-in). Decryption requires both this opt-in and an explicit unlock. */
  dmsEnabled(): boolean;
}

export class DmStoreModule {
  readonly lock = new StateStore<DmLockState>(LOCKED);
  private pubkey: string | null = null;
  /** Bumped on every account change: work started for an older one is dropped. */
  private epoch = 0;
  private key: CryptoKey | null = null;
  private memoryOnly = false;
  /** Set by a removal from Settings: nothing is written again until the reload. */
  private disabled = false;
  private readonly known = new Set<string>();
  /** The stored wire ids are in `known`: until then a held wrap may be one the store already has. */
  private indexed = false;
  private indexing: Promise<void> = Promise.resolve();
  private readonly held = new Map<string, { ev: NostrEvent; kind: HeldKind }>();
  private deferred: Array<() => void> = [];
  private unlocking: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private discoveryEnabled = false;
  private readonly openedPeers = new Set<string>();
  private readonly openedRecords = new Map<string, IngestDmParams>();
  private pendingDecryptions = 0;

  constructor(private readonly deps: DmStoreDeps) {}

  /** Point the store at `pubkey` (login, reload, account switch) or at nobody (logout). */
  attach(pubkey: string | null): void {
    if (pubkey === this.pubkey) return;
    this.epoch++;
    this.pubkey = pubkey;
    this.key = null;
    this.discoveryEnabled = false;
    this.openedPeers.clear();
    this.openedRecords.clear();
    this.pendingDecryptions = 0;
    this.memoryOnly = false;
    this.known.clear();
    this.indexed = false;
    this.held.clear();
    this.deferred = [];
    this.unlocking = null;
    this.lock.set(LOCKED);
    this.indexing = pubkey ? this.loadIndex(pubkey, this.epoch) : Promise.resolve();
  }

  isUnlocked(): boolean {
    return this.deps.dmsEnabled() && this.lock.get().status === 'unlocked';
  }

  /** The message carried by this wire event is already stored (or opened this visit). */
  knows(wireId: string): boolean {
    return this.known.has(wireId);
  }

  /** While locked, keep `ev` for the unlock instead of opening it. True when held. */
  hold(ev: NostrEvent, kind: HeldKind): boolean {
    if (!this.pubkey || (this.isUnlocked() && this.mayOpen(ev, kind))) return false;
    if (!this.held.has(ev.id) && this.held.size >= MAX_HELD) {
      const oldest = this.held.keys().next().value;
      if (oldest !== undefined) this.held.delete(oldest);
    }
    this.held.set(ev.id, { ev, kind });
    this.recount();
    return true;
  }

  /** Block while disabled or logged out; queue while locked. False only when opening is allowed. */
  defer(fn: () => void): boolean {
    if (!this.pubkey || !this.deps.dmsEnabled()) return true;
    if (this.isUnlocked()) return false;
    if (this.deferred.length >= MAX_DEFERRED) this.deferred.shift();
    this.deferred.push(fn);
    return true;
  }

  /** Open the store: one signer call, then everything stored, then what was held. Idempotent. */
  unlock(peer?: string): Promise<void> {
    const pubkey = this.pubkey;
    if (!pubkey || !this.deps.dmsEnabled()) return Promise.resolve();
    if (peer) this.openedPeers.add(peer);
    else this.discoveryEnabled = true;
    if (this.isUnlocked()) {
      for (const params of this.openedRecords.values()) {
        if (!peer || params.counterparty === peer) this.deps.replay(params);
      }
      this.finish(this.epoch, this.memoryOnly);
      return Promise.resolve();
    }
    if (this.unlocking) return this.unlocking;
    const epoch = this.epoch;
    this.lock.set({ ...this.lock.get(), status: 'unlocking' });
    const run = this.runUnlock(pubkey, epoch).finally(() => {
      if (this.unlocking === run) this.unlocking = null;
    });
    this.unlocking = run;
    return run;
  }

  /** Keep one opened message, encrypted. A no-op until unlocked, and for a message already kept. */
  save(params: IngestDmParams): void {
    const pubkey = this.pubkey;
    const wireId = params.notifyId;
    if (!pubkey || this.disabled || !this.isUnlocked() || this.known.has(wireId)) return;
    this.known.add(wireId);
    this.openedRecords.set(wireId, params);
    const key = this.key;
    const db = this.db();
    if (this.memoryOnly || !key || !db) return;
    const epoch = this.epoch;
    this.writes = this.writes.then(async () => {
      if (epoch !== this.epoch || this.disabled) return;
      const box = await sealRecord(key, encodeRecord(params), recordAad(pubkey, wireId));
      if (epoch !== this.epoch || this.disabled) return;
      await db.put(pubkey, wireId, box);
    }).catch(() => undefined);
  }

  /** Resolves once every write queued so far has landed (or failed). */
  whenIdle(): Promise<void> {
    return this.writes;
  }

  /**
   * Settings is about to delete the store's database: stop writing, drop the
   * key and wait for writes in flight. The reload that follows starts locked.
   */
  async forget(): Promise<void> {
    this.disabled = true;
    this.key = null;
    await this.writes;
  }

  /** Logout: forget the account in memory, then delete its key and records. */
  async destroy(): Promise<void> {
    const pubkey = this.pubkey;
    this.attach(null);
    await this.writes;
    const db = this.db();
    if (pubkey && db) await db.clearAccount(pubkey).catch(() => undefined);
  }

  private db(): DmStoreDb | null {
    const factory = pageIndexedDb();
    return factory && globalThis.crypto?.subtle ? dmStoreDb(factory) : null;
  }

  private recount(): void {
    if (!this.indexed) return;
    const unopened: number[] = [];
    for (const { ev, kind } of this.held.values()) {
      if (kind === 'wrap' && !this.known.has(ev.id)) unopened.push(ev.created_at * 1000);
    }
    this.lock.set({ ...this.lock.get(), unopened });
  }

  /**
   * The stored wire ids, so the bell counts only wraps the store does not
   * have. Never throws: an index that cannot be read counts as empty (every
   * held wrap is new to this visit, as it will be opened from the relay).
   */
  private async loadIndex(pubkey: string, epoch: number): Promise<void> {
    const db = this.db();
    let ids: string[] = [];
    try {
      if (db) ids = await db.wireIds(pubkey);
    } catch { /* unreadable: nothing is known to be stored */ }
    if (epoch !== this.epoch) return;
    this.indexed = true;
    if (this.isUnlocked()) return;
    for (const id of ids) this.known.add(id);
    this.recount();
  }

  private async runUnlock(pubkey: string, epoch: number): Promise<void> {
    // Start from a read index: the count a refusal leaves is then right, and
    // a late read cannot refill `known` after `replayStored` rebuilt it
    // (putting back the id of a box it deleted as unreadable).
    await this.indexing;
    if (epoch !== this.epoch) return;
    if (!this.deps.dmsEnabled()) return this.fail(epoch);
    const signer = this.deps.nipSigner();
    if (!signer || signer.pubkey !== pubkey) return this.fail(epoch);
    const db = this.db();
    if (!db) return this.finish(epoch, true);
    let wrapped: unknown;
    try {
      wrapped = await db.wrappedKey(pubkey);
    } catch {
      return this.finish(epoch, true);
    }
    if (epoch !== this.epoch || !this.deps.dmsEnabled()) return this.fail(epoch);
    let raw: Uint8Array | null = null;
    try {
      if (isWrappedDmKey(wrapped, pubkey)) raw = await unwrapDmKey(signer, wrapped);
    } catch {
      return this.fail(epoch);
    }
    if (epoch !== this.epoch) return void raw?.fill(0);
    if (!this.deps.dmsEnabled()) { raw?.fill(0); return this.fail(epoch); }
    const fresh = !raw;
    if (!raw) {
      // First unlock on this device, or a wrapped key that is not a key any
      // more: start over. Records under the old key could never open.
      raw = newRecordKeyBytes();
      let made: WrappedDmKey;
      try {
        made = await wrapDmKey(signer, raw);
      } catch {
        raw.fill(0);
        return this.fail(epoch);
      }
      try {
        await db.clearRecords(pubkey);
        await db.saveWrappedKey(pubkey, made);
      } catch {
        raw.fill(0);
        return this.finish(epoch, true);
      }
    }
    let key: CryptoKey;
    try {
      key = await importRecordKey(raw);
    } catch {
      return this.finish(epoch, true);
    } finally {
      raw.fill(0);
    }
    if (epoch !== this.epoch) return;
    this.key = key;
    if (!fresh) await this.replayStored(db, pubkey, epoch, key);
    else this.known.clear();
    this.finish(epoch, false);
  }

  private async replayStored(db: DmStoreDb, pubkey: string, epoch: number, key: CryptoKey): Promise<void> {
    let boxes: Awaited<ReturnType<DmStoreDb['boxes']>> = [];
    try {
      boxes = await db.boxes(pubkey);
    } catch { /* unreadable: the relays send the messages again */ }
    const opened: IngestDmParams[] = [];
    const removals: Array<Promise<unknown>> = [];
    this.known.clear();
    for (const { wireId, box } of boxes) {
      try {
        const params = decodeRecord(await openRecord(key, box, recordAad(pubkey, wireId)));
        if (!params) throw new Error('unreadable record');
        this.known.add(wireId);
        opened.push(params);
      } catch {
        // Tampered or unreadable: delete it so the relay's copy is opened again.
        removals.push(db.remove(pubkey, wireId).catch(() => undefined));
      }
    }
    await Promise.all(removals);
    if (epoch !== this.epoch) return;
    opened.sort((a, b) => a.createdAt - b.createdAt);
    for (const params of opened) {
      this.openedRecords.set(params.notifyId, params);
      if (this.discoveryEnabled || this.openedPeers.has(params.counterparty)) this.deps.replay(params);
    }
  }

  private fail(epoch: number): void {
    if (epoch === this.epoch) this.lock.set({ ...this.lock.get(), status: 'failed' });
  }

  private mayOpen(ev: NostrEvent, kind: HeldKind): boolean {
    if (this.discoveryEnabled) return true;
    if (kind === 'wrap') return false;
    const peer = ev.pubkey === this.pubkey ? ev.tags.find((t) => t[0] === 'p')?.[1] : ev.pubkey;
    return !!peer && this.openedPeers.has(peer);
  }

  private finish(epoch: number, memoryOnly: boolean): void {
    if (epoch !== this.epoch) return;
    if (!this.deps.dmsEnabled()) return this.fail(epoch);
    if (memoryOnly) {
      this.memoryOnly = true;
      this.key = null;
      this.known.clear();
    }
    const held = [...this.held.values()].filter(({ ev, kind }) => this.mayOpen(ev, kind));
    for (const { ev } of held) this.held.delete(ev.id);
    this.pendingDecryptions += held.length;
    this.lock.set({ status: 'unlocked', unopened: [], ...(this.pendingDecryptions ? { pendingDecryptions: this.pendingDecryptions } : {}) });
    this.recount();
    for (const { ev, kind } of held) {
      void Promise.resolve().then(() => {
        if (epoch === this.epoch && this.deps.dmsEnabled()) return this.deps.reingest(ev, kind);
      }).catch(() => {}).finally(() => {
        if (epoch !== this.epoch) return;
        this.pendingDecryptions--;
        const { pendingDecryptions: _previous, ...state } = this.lock.get();
        this.lock.set({ ...state, ...(this.pendingDecryptions ? { pendingDecryptions: this.pendingDecryptions } : {}) });
      });
    }
    const deferred = this.deferred;
    this.deferred = [];
    for (const fn of deferred) fn();
  }
}
