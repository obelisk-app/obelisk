/**
 * WebRTC negotiation for a DM call, on throwaway keys, delivered reliably.
 *
 * Each side mints a keypair for the call and announces only its public half
 * inside the gift-wrapped invite / accept. Negotiation then goes out as
 * kind-25050 events signed by that throwaway key, `p`-tagged to the other
 * side's throwaway key, with NIP-44 content between the two. The relay sees
 * two random keys exchanging opaque blobs — not who is calling whom, not the
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
 *   delivers each number once.
 * - **Messages are batched**: everything queued within {@link FLUSH_MS} —
 *   an offer and its trickle of ICE candidates, plus pending acks — rides in
 *   one event. Fewer events, fewer rate-limit drops.
 * - **`ready`** resolves once the subscription has EOSE'd on the relays, i.e.
 *   the REQ is live and anything published from now on will reach us.
 * - **The peer can be learned from the wire.** The caller subscribes to its
 *   own throwaway key as soon as it sends the invite, before it knows the
 *   callee's. The callee's first message (a `hello`) arrives signed by the
 *   callee's throwaway key and decrypts under it, which is how the caller
 *   learns it — without waiting for the gift-wrapped accept, which needs a
 *   signer round trip and an inbox relay.
 *
 * This deliberately does not ride the bridge's pool. That pool answers NIP-42
 * AUTH with the user's real key; this one has its own sockets and answers
 * AUTH, if a relay asks, with the throwaway key only.
 */

import { SimplePool, finalizeEvent, getPublicKey, type Event as NostrEvent, type EventTemplate, type Filter, type VerifiedEvent } from 'nostr-tools';
import { TextCoercingWebSocket } from '@nostr-wot/data';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { KIND_VOICE_SIGNAL } from '@/lib/nip-kinds';
import type { VoiceSignalPayload } from '@/lib/voice/types';

export const DM_CALL_SIGNAL_TAG = 'obelisk-dm-call';
/** NIP-40 lifetime of one negotiation event. */
const SIGNAL_TTL_S = 120;
/** Coalescing window for outbound messages and acks. */
export const FLUSH_MS = 40;
/** Re-send an unacknowledged message after this long. */
export const RESEND_MS = 1200;
/** Give up on a message after this many sends (~12 s). */
export const MAX_ATTEMPTS = 10;
/** `ready` resolves at the latest after this, EOSE or not. */
export const READY_TIMEOUT_MS = 4000;
/** NIP-44 caps plaintext at 64 KiB; stay well clear of it. */
const MAX_BATCH_CHARS = 40_000;
const SEEN_MAX = 2048;

export interface CallPoolLike {
  subscribe(
    relays: string[],
    filter: Filter,
    params: { onevent: (ev: NostrEvent) => void; oneose?: () => void; maxWait?: number; onclose?: (reasons: string[]) => void },
  ): { close: (reason?: string) => void };
  publish(relays: string[], event: NostrEvent): Promise<string>[];
  destroy?(): void;
}

/** What a numbered message carries. */
type Body = { t: 'hello' } | { t: 'sig'; s: VoiceSignalPayload };

interface Wire {
  v: 2;
  callId: string;
  /** Numbered messages. */
  m?: Array<{ i: number; b: Body }>;
  /** Acknowledged message numbers. */
  a?: number[];
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
  /** `id` is the sender's message number — monotonic per channel. */
  onSignal: (payload: VoiceSignalPayload, id: number) => void;
  /** The peer said hello — its subscription is live. */
  onHello?: (peerEph: string) => void;
  /** Test seam. */
  pool?: CallPoolLike;
}

interface Outgoing {
  body: Body;
  attempts: number;
  lastSentAt: number;
}

export class CallSignalChannel {
  readonly selfEph: string;
  /** Resolves once our REQ is live on the call relays (or after a timeout). */
  readonly ready: Promise<void>;
  private resolveReady!: () => void;
  private readonly pool: CallPoolLike;
  private readonly ownsPool: boolean;
  private readonly relays: string[];
  private peerEph: string | null;
  private conv: Uint8Array | null = null;
  private sub: { close: (reason?: string) => void } | null = null;
  private seenEvents = new Set<string>();
  private delivered = new Set<number>();
  private nextId = 1;
  private outbox = new Map<number, Outgoing>();
  private pendingAcks = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private resendTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly opts: CallSignalChannelOptions) {
    this.selfEph = getPublicKey(opts.selfSk);
    this.relays = [...opts.relays];
    this.peerEph = null;
    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    if (opts.peerEph) this.setPeer(opts.peerEph);
    if (opts.pool) {
      this.pool = opts.pool;
      this.ownsPool = false;
    } else {
      const sk = opts.selfSk;
      // `SimplePool`'s constructor type only admits two options, but it passes
      // the whole bag to `AbstractSimplePool` at runtime (as the bridge's does).
      this.pool = new SimplePool({
        // Same binary-frame guard the bridge's pool uses.
        websocketImplementation: TextCoercingWebSocket as unknown as typeof WebSocket,
        enablePing: true,
        // A socket that drops mid-call reconnects and re-issues the REQ, so a
        // renegotiation later in the call (camera on, screen share) still has
        // a way through.
        enableReconnect: true,
        // Only ever the throwaway key. Never the session.
        automaticallyAuth: () => (template: EventTemplate) => Promise.resolve(finalizeEvent(template, sk) as VerifiedEvent),
      } as ConstructorParameters<typeof SimplePool>[0]) as unknown as CallPoolLike;
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
    if (this.outbox.size > 0) this.scheduleFlush();
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
      maxWait: READY_TIMEOUT_MS,
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
    for (const [id, out] of this.outbox) {
      if (out.body.t === 'sig' && out.body.s.sessionId === sessionId) this.outbox.delete(id);
    }
  }

  private enqueue(body: Body): void {
    if (this.closed) return;
    this.outbox.set(this.nextId++, { body, attempts: 0, lastSentAt: 0 });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
  }

  private flush(): void {
    if (this.closed || !this.conv || !this.peerEph) return;
    const now = Date.now();
    const due: Array<{ i: number; b: Body }> = [];
    let size = 0;
    for (const [id, out] of this.outbox) {
      if (out.attempts > 0 && now - out.lastSentAt < RESEND_MS * 0.7) continue;
      if (out.attempts >= MAX_ATTEMPTS) {
        this.outbox.delete(id);
        continue;
      }
      const chars = JSON.stringify(out.body).length;
      if (due.length > 0 && size + chars > MAX_BATCH_CHARS) {
        // The rest goes in the next event, right after this one.
        this.scheduleFlush();
        break;
      }
      size += chars;
      out.attempts++;
      out.lastSentAt = now;
      due.push({ i: id, b: out.body });
    }
    const acks = [...this.pendingAcks];
    this.pendingAcks.clear();
    if (due.length > 0 || acks.length > 0) {
      const wire: Wire = { v: 2, callId: this.opts.callId };
      if (due.length > 0) wire.m = due;
      if (acks.length > 0) wire.a = acks;
      this.publish(wire);
    }
    this.armResend();
  }

  private armResend(): void {
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resendTimer = null;
    if (this.outbox.size === 0 || this.closed) return;
    // Jittered, so two sides re-sending at once never fall into lockstep
    // with each other or with a relay's rate-limit window.
    const delay = RESEND_MS * (0.75 + Math.random() * 0.5);
    this.resendTimer = setTimeout(() => {
      this.resendTimer = null;
      this.flush();
    }, delay);
  }

  private publish(wire: Wire): void {
    if (!this.conv || !this.peerEph) return;
    const now = Math.floor(Date.now() / 1000);
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
    // Failures are what the re-send is for.
    void Promise.any(this.pool.publish(this.relays, event)).catch(() => {});
  }

  private receive(ev: NostrEvent): void {
    if (this.closed || this.seenEvents.has(ev.id)) return;
    this.seenEvents.add(ev.id);
    if (this.seenEvents.size > SEEN_MAX) {
      const oldest = this.seenEvents.values().next().value;
      if (oldest) this.seenEvents.delete(oldest);
    }
    if (!ev.tags.some((t) => t[0] === 'p' && t[1] === this.selfEph)) return;
    let wire: Wire;
    if (this.peerEph) {
      // Pinned: only the one key the handshake named.
      if (ev.pubkey !== this.peerEph || !this.conv) return;
      wire = this.decode(ev.content, this.conv);
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

    for (const id of wire.a ?? []) this.outbox.delete(id);
    if (this.outbox.size === 0 && this.resendTimer) {
      clearTimeout(this.resendTimer);
      this.resendTimer = null;
    }
    const msgs = Array.isArray(wire.m) ? wire.m : [];
    for (const m of msgs) {
      if (!Number.isInteger(m?.i)) continue;
      this.pendingAcks.add(m.i);
      if (this.delivered.has(m.i)) continue;
      this.delivered.add(m.i);
      if (m.b?.t === 'hello') this.opts.onHello?.(ev.pubkey);
      else if (m.b?.t === 'sig' && m.b.s && typeof m.b.s.type === 'string') this.opts.onSignal(m.b.s, m.i);
    }
    if (msgs.length > 0) this.scheduleFlush();
  }

  private decode(content: string, conv: Uint8Array): Wire {
    try {
      const wire = JSON.parse(nip44.decrypt(content, conv)) as Wire;
      return wire?.v === 2 && wire.callId === this.opts.callId ? wire : (null as unknown as Wire);
    } catch {
      return null as unknown as Wire;
    }
  }

  close(): void {
    if (this.closed) return;
    // One last flush so a pending bye / ack still leaves.
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.flush();
    }
    this.closed = true;
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resolveReady();
    try { this.sub?.close(); } catch { /* ignore */ }
    this.sub = null;
    if (this.ownsPool) {
      try { this.pool.destroy?.(); } catch { /* ignore */ }
    }
  }
}
