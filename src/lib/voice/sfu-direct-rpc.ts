/**
 * Direct browser → SFU RPC over WebSocket.
 *
 * Uses the same request/response envelopes as `sfu-rpc.ts`, but
 * authenticates with a NIP-42-like kind 22242 challenge and then sends
 * mediasoup RPC directly to the SFU's advertised URL.
 */
import { getBridge } from '@/lib/nostr-bridge/client';
import type { RpcNotification, RpcResponse } from './sfu-rpc';

const AUTH_KIND = 22242;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_TIMEOUT_MS = 1800;
const DEFAULT_RETRY_DELAY_MS = 75;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRpcTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('rpc timeout:');
}

function mintClientId(): string {
  try {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function directRpcUrl(baseUrl: string, channelId: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.pathname = '/rpc';
  url.search = '';
  url.searchParams.set('channelId', channelId);
  return url.toString();
}

interface PendingCall {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SfuDirectRpc {
  private readonly channelId: string;
  private readonly sfuPubkey: string;
  private readonly onNotification: (n: RpcNotification) => void;
  private readonly url: string;
  private readonly clientId = mintClientId();
  private pending = new Map<string, PendingCall>();
  private ws: WebSocket | null = null;
  private closed = false;
  private nextId = 0;

  constructor(opts: {
    channelId: string;
    sfuPubkey: string;
    url: string;
    onNotification: (n: RpcNotification) => void;
  }) {
    this.channelId = opts.channelId;
    this.sfuPubkey = opts.sfuPubkey;
    this.onNotification = opts.onNotification;
    this.url = directRpcUrl(opts.url, opts.channelId);
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error('SfuDirectRpc already closed');
    if (typeof WebSocket === 'undefined') throw new Error('WebSocket unavailable');

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('direct rpc auth timeout'));
      }, DEFAULT_TIMEOUT_MS);

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      ws.onmessage = (ev) => {
        let parsed: unknown;
        try { parsed = JSON.parse(String(ev.data)); }
        catch {
          fail(new Error('direct rpc invalid json'));
          return;
        }
        if (!parsed || typeof parsed !== 'object') return;
        const msg = parsed as Record<string, unknown>;
        if (msg.type === 'auth') {
          void this.answerAuth(msg).catch(fail);
          return;
        }
        if (msg.type === 'auth_ok') {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          ws.onmessage = (next) => this.handleMessage(next);
          resolve();
          return;
        }
        if (msg.type === 'response') {
          this.handleResponse(msg as RpcResponse);
        } else if (msg.type === 'notification') {
          this.onNotification(msg as RpcNotification);
        }
      };
      ws.onerror = () => fail(new Error('direct rpc websocket error'));
      ws.onclose = () => {
        if (!settled) fail(new Error('direct rpc websocket closed'));
        this.rejectAll(new Error('direct rpc closed'));
      };
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.rejectAll(new Error('rpc closed'));
  }

  async request<T = unknown>(method: string, data?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (this.closed) throw new Error('rpc closed');
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('direct rpc not connected');
    const requestId = `${Date.now().toString(36)}-${(this.nextId++).toString(36)}`;
    const envelope = data === undefined
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
    ws.send(JSON.stringify(envelope));
    return result;
  }

  async requestWithRetry<T = unknown>(
    method: string,
    data?: unknown,
    opts: { attempts?: number; timeoutMs?: number; retryDelayMs?: number } = {},
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
        if (this.closed || attempt >= attempts || !isRpcTimeout(err)) throw err;
        await sleep(retryDelayMs);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  private async answerAuth(msg: Record<string, unknown>): Promise<void> {
    const challenge = typeof msg.challenge === 'string' ? msg.challenge : '';
    const relay = typeof msg.relay === 'string' ? msg.relay : this.url;
    const bridge = await getBridge();
    const event = await bridge.signEventTemplate({
      kind: AUTH_KIND,
      content: '',
      tags: [
        ['relay', relay],
        ['challenge', challenge],
        ['e', this.channelId],
        ['p', this.sfuPubkey],
        ['client', this.clientId],
      ],
    });
    this.ws?.send(JSON.stringify({ type: 'auth', clientId: this.clientId, event }));
  }

  private handleMessage(ev: MessageEvent): void {
    let parsed: unknown;
    try { parsed = JSON.parse(String(ev.data)); }
    catch { return; }
    if (!parsed || typeof parsed !== 'object') return;
    const msg = parsed as { type?: string };
    if (msg.type === 'response') this.handleResponse(parsed as RpcResponse);
    else if (msg.type === 'notification') this.onNotification(parsed as RpcNotification);
  }

  private handleResponse(resp: RpcResponse): void {
    const pending = this.pending.get(resp.requestId);
    if (!pending) return;
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

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
