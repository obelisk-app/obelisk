/**
 * The incoming-DM side (round 4 plan, step 15): the kind 4 and kind 1059
 * REQs on the active relay and on our own DM relays, the `'dm'` NIP-42
 * leases those relays are held under, the opt-out, and the gift-wrap
 * ingest. Pure move from `client.ts` (`subscribeIncomingDMs`,
 * `disableDirectMessages`, `ingestIncomingGiftWrap`).
 */
import type { Event as NostrEvent, Filter, UnsignedEvent } from 'nostr-tools';
import { KIND_DM_CALL_RUMOR, KIND_DM_FILE_RUMOR, KIND_ENCRYPTED_DM } from '@/utils/nip-kinds';
import type { AuthLease } from '@/lib/relay-hub';
import { KIND_GIFT_WRAP, KIND_NIP44_DM, unwrapGiftWrap } from '@nostr-wot/dm';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { getPreferences } from '@/services/preferences';
import { wotEngine } from '@/services/wot/engine';
import { parseDmFileRumor, type JsDmFile } from '@/utils/attachments/dm-file';
import type { BridgeContext, TrackedSub } from '../context';
import { normalizeRelayUrl } from '../relay-url';
import type { SignerLane } from '../signer-queue';
import { hasSeenWrap, markWrapSeen } from '../wrap-ledger';
import type { IngestDmParams } from './thread';

export type { IngestDmParams } from './thread';

export type DmInboxContext = Pick<BridgeContext, 'session' | 'relays' | 'subscribeWatched' | 'track' | 'closeTracked'>;

export interface DmInboxDeps {
  /** NIP-42 permission on one of our own DM relays, for as long as DMs are on. */
  acquireDmLease(relay: string): AuthLease;
  /** Our own inbox and NIP-65 relays (`dm/relays.ts`). */
  fetchMyDmRelays(): Promise<string[]>;
  setMyDmRelays(relays: string[]): void;
  resetDmRelays(): void;
  dmSigner(pqTrack: { current: boolean }, lane: SignerLane): DmNostrSigner | null;
  /** The session's connect generation; an ingest that outlived it is dropped. */
  generation(): number;
  ingestNip04(ev: NostrEvent): Promise<void>;
  ingestCall(message: UnsignedEvent & { id: string }, senderPubkey: string): void;
  ingestDM(params: IngestDmParams): void;
}

export class DmInboxModule {
  /**
   * Something asked for DMs this page-load (`subscribeDirectMessages`).
   * `switchRelay` and the session reset drop `subscribed` along with the
   * old REQs, and the hook that opened the REQs only re-runs when
   * `directMessagesEnabled` flips, so without this, the kind-1059 REQ stayed
   * closed after a relay switch until something remounted. Invisible for
   * chat (the next remount caught up on history), fatal for a call invite,
   * which is only worth anything live. `connect()` reopens from this.
   */
  wanted = false;
  subscribed = false;
  private handles: TrackedSub[] = [];
  /** NIP-42 permission on the user's own DM relays, keyed by normalized URL. Only populated from `subscribe()` after DM opt-in. */
  private readonly leases = new Map<string, AuthLease>();

  constructor(
    private readonly ctx: DmInboxContext,
    private readonly deps: DmInboxDeps,
  ) {}

  hasLease(url: string): boolean {
    return this.leases.has(url);
  }

  releaseLeases(): void {
    for (const lease of this.leases.values()) lease.release();
    this.leases.clear();
  }

  /** The REQs were released with every other session REQ (teardown); `subscribed` stays as it was. */
  dropHandles(): void {
    this.handles = [];
  }

  /** The REQs went with a session or relay reset; `connect()` reopens them from `wanted`. */
  forgetSubscriptions(): void {
    this.handles = [];
    this.subscribed = false;
  }

  disable(): void {
    for (const sub of this.handles) {
      this.ctx.closeTracked(sub);
    }
    this.handles = [];
    this.subscribed = false;
    this.wanted = false;
    this.releaseLeases();
    this.deps.resetDmRelays();
  }

  private open(relays: string[], filter: Filter, onEvent: (ev: NostrEvent) => void): void {
    const sub = this.ctx.subscribeWatched(relays, filter, onEvent);
    this.ctx.track(sub);
    this.handles.push(sub);
  }

  subscribe(): void {
    if (!getPreferences().directMessagesEnabled) return;
    const session = this.ctx.session();
    if (!session || this.subscribed) return;
    this.subscribed = true;
    const me = session.pubKeyHex;
    // DMs to me (kind 4 with #p = me) and from me (authored by me).
    const filterIn: Filter = { kinds: [KIND_ENCRYPTED_DM], '#p': [me], limit: 200 };
    const filterOut: Filter = { kinds: [KIND_ENCRYPTED_DM], authors: [me], limit: 200 };
    // NIP-17 gift wraps addressed to us. There is no equivalent "from me"
    // filter and there cannot be one, every wrap is signed by a fresh
    // ephemeral key, not by our own pubkey. That is precisely why the send
    // path publishes a second wrap addressed to us (`dm/nip17.ts`,
    // `publishSelfCopy`): this one filter is how our own outgoing
    // history comes back after a reload, and how it reaches our other
    // devices.
    const filterWraps: Filter = { kinds: [KIND_GIFT_WRAP], '#p': [me], limit: 200 };
    const relays = this.ctx.relays();
    for (const f of [filterIn, filterOut]) this.open(relays, f, (ev) => void this.deps.ingestNip04(ev));
    this.open(relays, filterWraps, (ev) => void this.ingestGiftWrap(ev));
    // Wide-net pickup: other clients publish DMs to the user's own NIP-17
    // (10050) inbox or NIP-65 (10002) read/write relays, not necessarily
    // the active relays. Resolve those, then add a parallel subscription.
    void this.deps.fetchMyDmRelays().then((urls) => {
      if (!this.subscribed || !this.ctx.session() || this.ctx.session()?.pubKeyHex !== me) return;
      const active = this.ctx.relays();
      const extras = urls.filter((u) => !active.includes(u));
      if (extras.length === 0) return;
      this.deps.setMyDmRelays(extras);
      for (const r of extras) {
        const key = normalizeRelayUrl(r);
        if (!this.leases.has(key)) this.leases.set(key, this.deps.acquireDmLease(r));
      }
      for (const f of [filterIn, filterOut]) this.open(extras, f, (ev) => void this.deps.ingestNip04(ev));
      this.open(extras, filterWraps, (ev) => void this.ingestGiftWrap(ev));
    });
  }

  /**
   * Ingest a kind-1059 gift wrap addressed to us, the NIP-17 counterpart of
   * the NIP-04 ingest. Unwraps via `@nostr-wot/dm`'s `unwrapGiftWrap`
   * (which verifies the seal's signature and rejects a forged rumor
   * authorship, see the design doc's Security section), then ingests into
   * the same `dmsByPeer` store the UI already reads.
   */
  async ingestGiftWrap(ev: NostrEvent): Promise<void> {
    const session = this.ctx.session();
    if (!session) return;
    // Before any decrypt: a wrap we already know produces nothing for a
    // thread (a call signal, a kind we don't read) isn't worth two signer
    // round-trips again. Chat wraps are never in this set, decrypted DMs are
    // memory-only, so re-opening their wrap is how a reload gets them back.
    // See `../wrap-ledger.ts`.
    if (hasSeenWrap('dm:inert', ev.id)) return;
    const me = session.pubKeyHex;
    const generation = this.deps.generation();
    // A fresh signer + tracker per call: `unwrapGiftWrap` doesn't report
    // whether the seal it opened was a post-quantum envelope, so the
    // adapter's `nip44Decrypt` records `isPqEnvelope(ciphertext)` on every
    // call it makes and we read it back afterwards. `unwrapGiftWrap` awaits
    // its wrap-layer decrypt before its seal-layer decrypt, so the seal
    // call, the one that actually matters, is always the last write.
    // Scoping the tracker to a fresh object per call (rather than a field
    // on `this`) keeps concurrent inbound wraps from racing on it.
    const pqTrack = { current: false };
    // Background lane: a connect-time backlog of inbound wraps is exactly the
    // traffic that used to sit in front of the user's own signatures.
    const signer = this.deps.dmSigner(pqTrack, 'background');
    if (!signer) return;
    let message: (UnsignedEvent & { id: string }) | undefined;
    let senderPubkey: string | undefined;
    try {
      ({ message, senderPubkey } = await unwrapGiftWrap(signer, ev));
    } catch {
      return; // can't decrypt/verify → skip silently, same as the NIP-04 path
    }
    if (this.ctx.session()?.pubKeyHex !== me || this.deps.generation() !== generation) return;
    // The WoT / mute / block gate, re-applied to the real sender. The
    // subscription-boundary gate in `subscribeWatched` saw only the wrap's
    // throwaway `pubkey`, so for a kind-1059 it passes everyone; this is the
    // first point where the author is known. Same predicate and same
    // outcome as a kind-4 DM from a blocked author (dropped at the boundary):
    // nothing enters `dmsByPeer`, no card, no chime, no call listener.
    //
    // The wrap is deliberately NOT recorded in the `dm:inert` ledger. A
    // block or mute is a local, reversible verdict; marking the wrap seen
    // would make the drop permanent (the ledger is checked before decrypt,
    // so nothing could ever recover the message after an unblock). Left
    // unmarked, the next connect replays the wrap and an unblocked sender's
    // messages reappear. The cost is two decrypts per blocked wrap per
    // connect, bounded by the subscription's `limit`.
    if (!wotEngine.isAllowed(senderPubkey, message.kind)) return;
    // Only wraps that will never show anything are recorded. A *failed*
    // decrypt above stays unmarked, that can be transient (locked
    // extension, declined prompt) and deserves a retry. Deliberately after
    // the session/generation guard, since a mid-flight account switch means
    // a different ledger.
    if (message.kind === KIND_DM_CALL_RUMOR) {
      // Worthless a minute after it was sent.
      markWrapSeen('dm:inert', ev.id);
      this.deps.ingestCall(message, senderPubkey);
      return;
    }
    let file: JsDmFile | undefined;
    if (message.kind === KIND_DM_FILE_RUMOR) {
      // An undecryptable file message (unknown algorithm, non-http URL) is
      // dropped like any other rumor we cannot render.
      file = parseDmFileRumor(message.content, message.tags) ?? undefined;
      if (!file) { markWrapSeen('dm:inert', ev.id); return; }
    } else if (message.kind !== KIND_NIP44_DM) {
      markWrapSeen('dm:inert', ev.id);
      return; // ignore other NIP-17 rumor kinds
    }
    const outgoing = senderPubkey === me;
    // Mirrors @nostr-wot/dm's own `handleGiftWrap`: an outgoing wrap (e.g. a
    // self-copy from another device) carries the real recipient in the
    // rumor's own `p` tag; an inbound one is from the sender directly.
    const counterparty = outgoing ? message.tags.find((t) => t[0] === 'p')?.[1] : senderPubkey;
    if (!counterparty) return;
    this.deps.ingestDM({
      id: message.id,
      createdAt: message.created_at,
      plaintext: message.content,
      outgoing,
      counterparty,
      protocol: 'nip17',
      pq: pqTrack.current,
      notifyId: ev.id,
      file,
      tags: message.tags,
      raw: { rumor: message, wire: ev },
    });
  }
}
