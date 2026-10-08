/**
 * WebRTC negotiation for a DM call, on throwaway keys, delivered reliably.
 *
 * Each side mints a keypair for the call and announces only its public half
 * inside the gift-wrapped invite / accept. Negotiation then goes out as
 * kind-25050 events signed by that throwaway key, `p`-tagged to the other
 * side's throwaway key, with NIP-44 content between the two. The relay sees
 * two random keys exchanging opaque blobs, not who is calling whom, not the
 * call id, not the SDP (and so not the IP addresses in it).
 *
 * ## Why this layer is reliable
 *
 * Kind 25050 is *ephemeral*: a relay forwards it to subscriptions open at
 * that instant and keeps nothing. An offer published a moment before the
 * other side's REQ is live is simply gone, as is any event a relay drops
 * under rate limiting. The first version relied on a 12 s connect timeout to
 * recover from that, which is exactly the "sometimes instant, sometimes it
 * never connects" the calls showed. So:
 *
 * - **Every message is numbered, acknowledged, and re-sent** until acked
 *   (every {@link RESEND_MS}, up to {@link MAX_ATTEMPTS}). The receiver
 *   delivers each number once. (`ReliableOutbox`, `signal-outbox.ts`.)
 * - **Messages are batched**: everything queued within {@link FLUSH_MS}
 *   (an offer and its trickle of ICE candidates, plus pending acks) rides in
 *   one event. Fewer events, fewer rate-limit drops.
 * - **`ready`** resolves once the subscription has EOSE'd on the relays, i.e.
 *   the REQ is live and anything published from now on will reach us.
 * - **The peer can be learned from the wire.** The caller subscribes to its
 *   own throwaway key as soon as it sends the invite, before it knows the
 *   callee's. The callee's first message (a `hello`) arrives signed by the
 *   callee's throwaway key and decrypts under it, which is how the caller
 *   learns it: without waiting for the gift-wrapped accept, which needs a
 *   signer round trip and an inbox relay.
 *
 * The sockets are the call's own (`call-pool.ts`): the page's relay hub
 * under the call's own never-authenticating identity, so they are never
 * the session's sockets and a relay cannot link the throwaway key to the
 * session identity.
 */

import { finalizeEvent, getPublicKey, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { KIND_VOICE_SIGNAL } from '@/constants/nostr/nip-kinds';
import type { VoiceSignalPayload } from '@/types/voice/protocol';
import { createCallPool, pageHubForCalls, type CallPoolLike } from './call-pool';
import { ReliableOutbox, type Body, type OutboxBatch } from './signal-outbox';
import { DM_CALL_SIGNAL_TAG, READY_TIMEOUT_MS } from '@/constants/call/signaling';

export type { CallPoolLike } from './call-pool';
export { FLUSH_MS, MAX_ATTEMPTS, RESEND_MS } from '@/constants/call/signal-outbox';

/** NIP-40 lifetime of one negotiation event. */
const SIGNAL_TTL_S = 120;
const SEEN_MAX = 2048;

interface Wire extends OutboxBatch {
  v: 2;
  callId: string;
}

export interface CallSignalChannelOptions {
  relays: readonly string[];
  /** Our throwaway secret key for this call. */
  selfSk: Uint8Array;
  /**
   * The other side's throwaway pubkey, when known. When omitted, the first
   * event that decrypts under its own author and carries a `hello` for this
   * call fixes it (see {@link CallSignalChannel.onPeer}).
   */
  peerEph?: string;
  callId: string;
  /** `id` is the sender's message number: monotonic per channel. */
  onSignal: (payload: VoiceSignalPayload, id: number) => void;
  /** The peer said hello: its subscription is live. */
  onHello?: (peerEph: string) => void;
  /** Test seam. */
  pool?: CallPoolLike;
}

export class CallSignalChannel {
  readonly selfEph: string;
  /** Resolves once our REQ is live on the call relays (or after a timeout). */
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private readonly pool: CallPoolLike;
  private readonly ownsPool: boolean;
  private readonly relays: string[];
  private readonly outbox: ReliableOutbox;
  private peerEph: string | null;
  private conv: Uint8Array | null = null;
  private sub: { close: (reason?: string) => void } | null = null;
  private seenEvents = new Set<string>();
  private delivered = new Set<number>();
  private delivery: { rejectedReported: boolean; undecodableReported: boolean } = { rejectedReported: false, undecodableReported: false };
  private closed = false;

  constructor(private readonly opts: CallSignalChannelOptions) {
    this.selfEph = getPublicKey(opts.selfSk);
    this.relays = [...opts.relays];
    this.peerEph = null;
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    this.outbox = new ReliableOutbox({
      canSend: () => this.conv !== null && this.peerEph !== null,
      publish: (batch) => this.publish(batch),
    });
    if (opts.peerEph) this.setPeer(opts.peerEph);
    if (opts.pool) {
      this.pool = opts.pool;
      this.ownsPool = false;
    } else {
      this.pool = createCallPool(pageHubForCalls(), opts.callId, this.selfEph);
      this.ownsPool = true;
    }
  }

  /** The other side's throwaway key, once known. */
  get peer(): string | null {
    return this.peerEph;
  }

  /** Fix the peer's throwaway key (from the gift-wrapped accept). Idempotent. */
  setPeer(peerEph: string): void {
    if (this.peerEph) return;
    this.peerEph = peerEph;
    this.conv = nip44.utils.getConversationKey(this.opts.selfSk, peerEph);
    if (this.outbox.size > 0) this.outbox.scheduleFlush();
  }

  start(): void {
    if (this.sub || this.closed) return;
    const filter: Filter = {
      kinds: [KIND_VOICE_SIGNAL],
      '#p': [this.selfEph],
      since: Math.floor(Date.now() / 1000) - 30,
    };
    const timeout = setTimeout(() => this.resolveReady(), READY_TIMEOUT_MS);
    this.sub = this.pool.subscribe(this.relays, filter, {
      onevent: (ev) => this.receive(ev),
      oneose: () => { clearTimeout(timeout); this.resolveReady(); },
    });
  }

  /** Announce that our subscription is live. Reliable like everything else. */
  sendHello(): void {
    this.enqueue({ t: 'hello' });
  }

  /** Queue a negotiation payload for reliable delivery. */
  send(payload: VoiceSignalPayload): Promise<void> {
    this.enqueue({ t: 'sig', s: payload });
    return Promise.resolve();
  }

  /**
   * Forget unacknowledged messages that belong to a negotiation we have torn
   * down, so a late re-send can't drag the other side back to it.
   */
  dropSession(sessionId: string): void {
    this.outbox.dropSession(sessionId);
  }

  private enqueue(body: Body): void {
    if (this.closed) return;
    this.outbox.enqueue(body);
  }

  private publish(batch: OutboxBatch): void {
    if (!this.conv || !this.peerEph) return;
    const now = Math.floor(Date.now() / 1000);
    const wire: Wire = { v: 2, callId: this.opts.callId, ...batch };
    const event = finalizeEvent(
      {
        kind: KIND_VOICE_SIGNAL,
        created_at: now,
        tags: [
          ['p', this.peerEph],
          ['t', DM_CALL_SIGNAL_TAG],
          ['expiration', String(now + SIGNAL_TTL_S)],
        ],
        content: nip44.encrypt(JSON.stringify(wire), this.conv),
      },
      this.opts.selfSk,
    );
    // One relay dropping one event is what the re-send is for. Every call
    // relay refusing is not: the re-sends fail the same way and the call
    // ends on its deadline with no trace of why, so the first is reported.
    void this.pool.publish(this.relays, event).catch((err: unknown) => {
      if (this.delivery.rejectedReported) return;
      this.delivery.rejectedReported = true;
      console.warn('[dm-call] no call relay accepted a signaling event; re-sending', err);
    });
  }

  private receive(ev: NostrEvent): void {
    if (this.closed || this.seenEvents.has(ev.id)) return;
    this.seenEvents.add(ev.id);
    if (this.seenEvents.size > SEEN_MAX) {
      const oldest = this.seenEvents.values().next().value;
      if (oldest) this.seenEvents.delete(oldest);
    }
    if (!ev.tags.some((t) => t[0] === 'p' && t[1] === this.selfEph)) return;
    let wire: Wire | null;
    if (this.peerEph) {
      // Pinned: only the one key the handshake named.
      if (ev.pubkey !== this.peerEph || !this.conv) return;
      wire = this.decode(ev.content, this.conv);
      if (!wire && !this.delivery.undecodableReported) {
        // The peer we are negotiating with sent something that is not
        // this call's: a key or call-id mismatch that no re-send can fix.
        this.delivery.undecodableReported = true;
        console.warn('[dm-call] an event from the call peer did not decode for this call; dropped', ev.id);
      }
    } else {
      // Not yet pinned: accept the first author whose event decrypts under
      // its own key AND says hello for this call. Only the callee knows our
      // throwaway key (it came in their gift-wrapped invite) and the call id.
      const conv = nip44.utils.getConversationKey(this.opts.selfSk, ev.pubkey);
      wire = this.decode(ev.content, conv);
      if (!wire || !wire.m?.some((m) => m.b?.t === 'hello')) return;
      this.setPeer(ev.pubkey);
    }
    if (!wire) return;

    this.outbox.ack(wire.a ?? []);
    const msgs = Array.isArray(wire.m) ? wire.m : [];
    for (const m of msgs) {
      if (!Number.isInteger(m?.i)) continue;
      this.outbox.acknowledge(m.i);
      if (this.delivered.has(m.i)) continue;
      this.delivered.add(m.i);
      if (m.b?.t === 'hello') this.opts.onHello?.(ev.pubkey);
      else if (m.b?.t === 'sig' && m.b.s && typeof m.b.s.type === 'string') this.opts.onSignal(m.b.s, m.i);
    }
    if (msgs.length > 0) this.outbox.scheduleFlush();
  }

  /**
   * `null` when the content is not this call's. Before the peer is pinned
   * that is the expected outcome of probing an author; the catch is that
   * probe, not a swallowed failure.
   */
  private decode(content: string, conv: Uint8Array): Wire | null {
    try {
      const wire = JSON.parse(nip44.decrypt(content, conv)) as Wire;
      return wire?.v === 2 && wire.callId === this.opts.callId ? wire : null;
    } catch {
      return null;
    }
  }

  close(): void {
    if (this.closed) return;
    // One last flush so a pending bye / ack still leaves.
    this.outbox.close();
    this.closed = true;
    this.resolveReady();
    // Teardown of sockets that may already be gone: nostr-tools throws on a
    // CLOSE sent over a connection it has dropped, and there is nothing
    // left to do with that.
    try { this.sub?.close(); } catch { /* the subscription is gone either way */ }
    this.sub = null;
    if (this.ownsPool) {
      try { this.pool.destroy?.(); } catch { /* the sockets are gone either way */ }
    }
  }
}
