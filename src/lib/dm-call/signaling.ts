/**
 * WebRTC negotiation for a DM call, on throwaway keys.
 *
 * Each side mints a keypair for the call and announces only its public half,
 * inside the gift-wrapped invite / accept. SDP, ICE and control payloads then
 * go out as ordinary ephemeral kind-25050 events signed by that throwaway key,
 * `p`-tagged to the other side's throwaway key, with NIP-44 content between
 * the two. The relay carrying the call sees two random keys exchanging opaque
 * blobs for a few seconds: not who is calling whom, not the call id, not the
 * SDP (and so not the IP addresses in it).
 *
 * This deliberately does not ride the bridge's pool. That pool answers
 * NIP-42 AUTH with the user's real key; this one has its own sockets and
 * answers AUTH, if a relay asks, with the throwaway key only. A relay that
 * whitelists real npubs therefore can't carry a call — that is the price of
 * the relay never learning who is on it, and why the call relays are a
 * separate, user-chosen list (`preferences.callRelays`).
 */

import { SimplePool, finalizeEvent, getPublicKey, type Event as NostrEvent, type EventTemplate, type Filter, type VerifiedEvent } from 'nostr-tools';
import { TextCoercingWebSocket } from '@nostr-wot/data';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { KIND_VOICE_SIGNAL } from '@/lib/nip-kinds';
import type { VoiceSignalPayload } from '@/lib/voice/types';

export const DM_CALL_SIGNAL_TAG = 'obelisk-dm-call';
/** NIP-40 lifetime of one negotiation event. */
const SIGNAL_TTL_S = 120;
const SEEN_MAX = 1024;

export interface CallPoolLike {
  subscribe(
    relays: string[],
    filter: Filter,
    params: { onevent: (ev: NostrEvent) => void; onclose?: (reasons: string[]) => void },
  ): { close: (reason?: string) => void };
  publish(relays: string[], event: NostrEvent): Promise<string>[];
  destroy?(): void;
}

export interface CallSignalChannelOptions {
  relays: readonly string[];
  /** Our throwaway secret key for this call. */
  selfSk: Uint8Array;
  /** The other side's throwaway pubkey. */
  peerEph: string;
  callId: string;
  onSignal: (payload: VoiceSignalPayload) => void;
  /** Test seam. */
  pool?: CallPoolLike;
}

interface Envelope {
  callId: string;
  payload: VoiceSignalPayload;
}

export class CallSignalChannel {
  readonly selfEph: string;
  private readonly pool: CallPoolLike;
  private readonly ownsPool: boolean;
  private readonly conv: Uint8Array;
  private readonly relays: string[];
  private sub: { close: (reason?: string) => void } | null = null;
  private seen = new Set<string>();
  private closed = false;

  constructor(private readonly opts: CallSignalChannelOptions) {
    this.selfEph = getPublicKey(opts.selfSk);
    this.relays = [...opts.relays];
    this.conv = nip44.utils.getConversationKey(opts.selfSk, opts.peerEph);
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
        // Only ever the throwaway key. Never the session.
        automaticallyAuth: () => (template: EventTemplate) => Promise.resolve(finalizeEvent(template, sk) as VerifiedEvent),
      } as ConstructorParameters<typeof SimplePool>[0]) as unknown as CallPoolLike;
      this.ownsPool = true;
    }
  }

  start(): void {
    if (this.sub || this.closed) return;
    const filter: Filter = {
      kinds: [KIND_VOICE_SIGNAL],
      '#p': [this.selfEph],
      since: Math.floor(Date.now() / 1000) - 30,
    };
    this.sub = this.pool.subscribe(this.relays, filter, { onevent: (ev) => this.receive(ev) });
  }

  private receive(ev: NostrEvent): void {
    if (this.closed) return;
    if (this.seen.has(ev.id)) return;
    this.seen.add(ev.id);
    if (this.seen.size > SEEN_MAX) {
      const oldest = this.seen.values().next().value;
      if (oldest) this.seen.delete(oldest);
    }
    // The pool verifies signatures; this pins the author to the one key the
    // gift-wrapped handshake told us about.
    if (ev.pubkey !== this.opts.peerEph) return;
    if (!ev.tags.some((t) => t[0] === 'p' && t[1] === this.selfEph)) return;
    let env: Envelope;
    try {
      env = JSON.parse(nip44.decrypt(ev.content, this.conv)) as Envelope;
    } catch {
      return;
    }
    if (env?.callId !== this.opts.callId || !env.payload || typeof env.payload.type !== 'string') return;
    this.opts.onSignal(env.payload);
  }

  /** Resolves once any relay accepted the event; rejects if none did. */
  async send(payload: VoiceSignalPayload): Promise<void> {
    if (this.closed) return;
    const content = nip44.encrypt(JSON.stringify({ callId: this.opts.callId, payload } satisfies Envelope), this.conv);
    const event = finalizeEvent(
      {
        kind: KIND_VOICE_SIGNAL,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', this.opts.peerEph],
          ['t', DM_CALL_SIGNAL_TAG],
          ['expiration', String(Math.floor(Date.now() / 1000) + SIGNAL_TTL_S)],
        ],
        content,
      },
      this.opts.selfSk,
    );
    await Promise.any(this.pool.publish(this.relays, event));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.sub?.close(); } catch { /* ignore */ }
    this.sub = null;
    if (this.ownsPool) {
      try { this.pool.destroy?.(); } catch { /* ignore */ }
    }
  }
}
