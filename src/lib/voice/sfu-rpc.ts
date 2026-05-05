/**
 * Browser-side request/response RPC over kind 25050 — peer of
 * `services/sfu/src/nostr-rpc.ts`. Same envelope schema:
 *
 *   request:      { type:'request',  requestId, method, data? }
 *   response:     { type:'response', requestId, ok: true,  data? }
 *                 { type:'response', requestId, ok: false, error: { message, code? } }
 *   notification: { type:'notification', method, data? }
 *
 * Each `request()` call:
 *   - generates a fresh `requestId`
 *   - publishes a kind 25050 event to the SFU pubkey
 *   - resolves when the matching response arrives, or rejects on timeout
 *
 * Inbound notifications are dispatched to a single async handler so the
 * caller can decide what to do (newProducer → consume, producerClosed →
 * stop the consumer, etc).
 */
import { KIND_VOICE_SIGNAL } from '@/lib/nip-kinds';
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';

async function bridge() {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  return impl;
}

export interface RpcRequestEnvelope<T = unknown> {
  type: 'request';
  requestId: string;
  method: string;
  data?: T;
}

export interface RpcResponseOk<T = unknown> {
  type: 'response';
  requestId: string;
  ok: true;
  data?: T;
}

export interface RpcResponseErr {
  type: 'response';
  requestId: string;
  ok: false;
  error: { message: string; code?: string };
}

export type RpcResponse<T = unknown> = RpcResponseOk<T> | RpcResponseErr;

export interface RpcNotification<T = unknown> {
  type: 'notification';
  method: string;
  data?: T;
}

const DEFAULT_TIMEOUT_MS = 8000;

interface PendingCall {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * RPC client bound to a single channel + remote (the SFU). Caller owns the
 * lifecycle — `start()` opens the inbound subscription, `close()` tears it
 * down and rejects every pending call.
 */
export class SfuRpc {
  private readonly channelId: string;
  private readonly sfuPubkey: string;
  private readonly selfPubkey: string;
  private readonly onNotification: (n: RpcNotification) => void;
  /**
   * Relays the RPC envelopes are published to. Defaults to whatever the
   * bridge has, but for SFUs that only listen on a permissioned trusted
   * relay (e.g. relay.obelisk.ar), the caller must pass that relay here
   * — otherwise envelopes go to the bridge default (public.obelisk.ar)
   * and the SFU never sees them. Browser stays on its bridge relays for
   * receiving; this only scopes outbound publishes.
   */
  private readonly publishRelays: readonly string[];

  private pending = new Map<string, PendingCall>();
  private signalUnsub: (() => void) | null = null;
  private closed = false;
  private nextId = 0;

  constructor(opts: {
    channelId: string;
    sfuPubkey: string;
    selfPubkey: string;
    onNotification: (n: RpcNotification) => void;
    publishRelays?: readonly string[];
  }) {
    this.channelId = opts.channelId;
    this.sfuPubkey = opts.sfuPubkey;
    this.selfPubkey = opts.selfPubkey;
    this.onNotification = opts.onNotification;
    this.publishRelays = opts.publishRelays ?? [];
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('SfuRpc already closed');
    const b = await bridge();
    const since = Math.floor(Date.now() / 1000) - 30;
    this.signalUnsub = b.subscribeFilterWatched(
      {
        kinds: [KIND_VOICE_SIGNAL],
        '#e': [this.channelId],
        since,
      },
      (ev) => {
        // Only events FROM the SFU matter. Ignore mesh-style chatter from
        // other peers (mesh and SFU coexist on the same kind 25050).
        if (ev.pubkey !== this.sfuPubkey) return;
        const targets = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
        if (targets.length > 0 && !targets.includes(this.selfPubkey)) return;
        let parsed: unknown;
        try { parsed = JSON.parse(ev.content); } catch { return; }
        if (!parsed || typeof parsed !== 'object') return;
        const env = parsed as { type?: string };
        if (env.type === 'response') {
          this.handleResponse(parsed as RpcResponse);
        } else if (env.type === 'notification') {
          this.onNotification(parsed as RpcNotification);
        }
        // requests from SFU don't exist in v1 — server is response-only.
      },
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.signalUnsub?.();
    this.signalUnsub = null;
    const error = new Error('rpc closed');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Issue an RPC call. Resolves with the `data` field of the response on
   * success; rejects with `Error` (and `.code` from the server) on failure.
   */
  async request<T = unknown>(method: string, data?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (this.closed) throw new Error('rpc closed');
    const requestId = `${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
    const envelope: RpcRequestEnvelope = data === undefined
      ? { type: 'request', requestId, method }
      : { type: 'request', requestId, method, data };
    const result = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`rpc timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (d) => resolve(d as T),
        reject,
        timer,
      });
    });
    const b = await bridge();
    await b.publishEvent({
      kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify(envelope),
      tags: [
        ['p', this.sfuPubkey],
        ['e', this.channelId],
        ['t', 'obelisk-voice-signal'],
      ],
    }, this.publishRelays.length > 0 ? [...this.publishRelays] : undefined);
    return result;
  }

  private handleResponse(resp: RpcResponse): void {
    const pending = this.pending.get(resp.requestId);
    if (!pending) return; // late or unknown
    this.pending.delete(resp.requestId);
    clearTimeout(pending.timer);
    if (resp.ok) {
      pending.resolve(resp.data);
    } else {
      const err = new Error(resp.error.message);
      if (resp.error.code) (err as Error & { code: string }).code = resp.error.code;
      pending.reject(err);
    }
  }
}
