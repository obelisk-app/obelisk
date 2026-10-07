/**
 * Browser-side request/response RPC over direct WebSocket or kind 25050 - peer of
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
import { KIND_VOICE_SIGNAL } from '@/utils/nostr/nip-kinds';
import { connectDirectRpc } from './sfu-rpc-direct';
import { subscribeRelayRpc } from './sfu-rpc-relay';
import {
  bridge,
  DEFAULT_RETRY_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RETRY_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
  DirectRpcError,
  isRpcTimeout,
  mintClientId,
  sleep,
  type PendingCall,
  type RpcNotification,
  type RpcRequestEnvelope,
  type RpcResponse,
} from './sfu-rpc-support';

export type {
  RpcNotification,
  RpcRequestEnvelope,
  RpcResponse,
  RpcResponseErr,
  RpcResponseOk,
} from './sfu-rpc-support';

// Build identity - bumped per-deploy. Same purpose as the marker in
// voice/client.ts: forces turbopack to mint a fresh chunk filename so
// sticky local caches can't pin a stale SfuRpc on the same URL.
if (typeof globalThis !== 'undefined') {
  (globalThis as { __obeliskSfuRpcBuild?: string }).__obeliskSfuRpcBuild =
    '2026-07-26T15:20:00Z-direct-websocket-rpc';
}


/**
 * RPC client bound to a single channel + remote (the SFU). Caller owns the
 * lifecycle - `start()` opens the inbound subscription, `close()` tears it
 * down and rejects every pending call.
 */
export class SfuRpc {
  private readonly channelId: string;
  private readonly sfuPubkey: string;
  private readonly selfPubkey: string;
  private readonly sfuUrl: string | null;
  private readonly onNotification: (n: RpcNotification) => void;
  private readonly onRelayFallback: (() => Promise<void>) | null;
  /**
   * Relays the RPC envelopes are published to. Defaults to whatever the
   * bridge has, but for SFUs that only listen on a permissioned trusted
   * relay (e.g. lacrypta-relay.obelisk.ar), the caller must pass that relay here
   * - otherwise envelopes go to the bridge default (public.obelisk.ar)
   * and the SFU never sees them. Browser stays on its bridge relays for
   * receiving; this only scopes outbound publishes.
   */
  private readonly publishRelays: readonly string[];

  private pending = new Map<string, PendingCall>();
  private signalUnsub: (() => void) | null = null;
  private socket: WebSocket | null = null;
  private transport: 'direct' | 'relay' | null = null;
  private closed = false;
  private nextId = 0;
  /**
   * Stable per-connection id, minted once per SfuRpc construction. Sent
   * in every request envelope so the SFU can distinguish two devices
   * sharing one Nostr pubkey. 8 random bytes hex is plenty - collisions
   * are infeasible within a single user's device fleet.
   */
  private readonly clientId: string;

  constructor(opts: {
    channelId: string;
    sfuPubkey: string;
    sfuUrl?: string;
    selfPubkey: string;
    onNotification: (n: RpcNotification) => void;
    onRelayFallback?: () => Promise<void>;
    publishRelays?: readonly string[];
  }) {
    this.channelId = opts.channelId;
    this.sfuPubkey = opts.sfuPubkey;
    this.selfPubkey = opts.selfPubkey;
    this.sfuUrl = opts.sfuUrl ?? null;
    this.onNotification = opts.onNotification;
    this.onRelayFallback = opts.onRelayFallback ?? null;
    this.publishRelays = opts.publishRelays ?? [];
    this.clientId = mintClientId();
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('SfuRpc already closed');
    if (this.sfuUrl && typeof WebSocket !== 'undefined') {
      try {
        await this.startDirect();
        return;
      } catch (err) {
        if (err instanceof DirectRpcError && err.closeCode >= 4401) throw err;
        console.warn('[sfu] direct RPC unavailable; falling back to Nostr relays', err);
        await this.onRelayFallback?.();
      }
    }
    await this.startRelay();
  }

  /** The relay path; see `sfu-rpc-relay.ts`. */
  private async startRelay(): Promise<void> {
    await subscribeRelayRpc({
      channelId: this.channelId,
      sfuPubkey: this.sfuPubkey,
      selfPubkey: this.selfPubkey,
      publishRelays: this.publishRelays,
      attach: (unsub) => { this.signalUnsub = unsub; },
      onInbound: (message) => this.handleInbound(message),
    });
    this.transport = 'relay';
  }

  /** The direct WebSocket path; see `sfu-rpc-direct.ts`. */
  private startDirect(): Promise<void> {
    return connectDirectRpc({
      sfuUrl: this.sfuUrl!,
      channelId: this.channelId,
      clientId: this.clientId,
      attach: (socket) => { this.socket = socket; },
      onAuthenticated: () => { this.transport = 'direct'; },
      onInbound: (message) => this.handleInbound(message),
      onLost: (error) => {
        this.socket = null;
        this.failPending(error);
      },
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.transport = null;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(); } catch { /* ignore */ }
    this.signalUnsub?.();
    this.signalUnsub = null;
    this.failPending(new Error('rpc closed'));
  }

  /**
   * Issue an RPC call. Resolves with the `data` field of the response on
   * success; rejects with `Error` (and `.code` from the server) on failure.
   */
  async request<T = unknown>(method: string, data?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (this.closed) throw new Error('rpc closed');
    const requestId = `${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
    const envelope: RpcRequestEnvelope = data === undefined
      ? { type: 'request', requestId, method, clientId: this.clientId }
      : { type: 'request', requestId, method, data, clientId: this.clientId };
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
    try {
      if (this.transport === 'direct') {
        if (!this.socket || this.socket.readyState !== 1) {
          throw new Error('SFU WebSocket disconnected');
        }
        this.socket.send(JSON.stringify(envelope));
      } else {
        const b = await bridge();
        await b.publishEvent({
          kind: KIND_VOICE_SIGNAL,
          content: JSON.stringify(envelope),
          tags: [
            ['p', this.sfuPubkey],
            ['e', this.channelId],
            ['t', 'obelisk-voice-signal'],
          ],
        }, this.publishRelays.length > 0 ? { extraRelays: [...this.publishRelays] } : undefined);
      }
    } catch (err) {
      const pending = this.pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
      }
      throw err;
    }
    return result;
  }

  async requestWithRetry<T = unknown>(
    method: string,
    data?: unknown,
    opts: {
      attempts?: number;
      timeoutMs?: number;
      retryDelayMs?: number;
    } = {},
  ): Promise<T> {
    const attempts = Math.max(1, opts.attempts ?? DEFAULT_RETRY_ATTEMPTS);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_RETRY_TIMEOUT_MS;
    const retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.request<T>(method, data, timeoutMs);
      } catch (err) {
        lastErr = err;
        if (this.closed || attempt >= attempts || !isRpcTimeout(err)) {
          throw err;
        }
        await sleep(retryDelayMs);
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private handleInbound(message: Record<string, unknown>): void {
    if (message.type === 'response') {
      this.handleResponse(message as unknown as RpcResponse);
    } else if (message.type === 'notification') {
      this.onNotification(message as unknown as RpcNotification);
    }
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

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
