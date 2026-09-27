/**
 * The host side of Obelisk Apps host API v1 (obelisk-apps docs/host-api.md).
 *
 * One AppHost per open app frame. It owns the frame's MessagePort and is the
 * only thing that turns an app's request into something with consequences —
 * a signed event, a stored value, a fetched file. Everything arriving on the
 * port is untrusted input; the rules below are enforced HERE, never in the
 * app's SDK:
 *
 *   - publish: kind 2390 only, with `h`, `t`, `op`, `e` set by the host from
 *     the session the frame was opened for; `op` from an allowlisted pattern,
 *     never `create`; `n` the only extra tag; content capped; token bucket.
 *   - asset: only the session's pinned paths, verified by sha256 (bundle.ts).
 *   - storage: namespaced per app address and user, byte-capped.
 *   - profiles: only for pubkeys that authored an event in this session.
 *   - no signer, relay URL, group id or avatar URL ever crosses the port.
 *
 * Framework-free so it can be tested against a MessageChannel; the React
 * modal (AppFrameModal) wires the real bridge in.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SESSION } from '@/lib/nip-kinds';

import type { AppPath } from './manifest';
import { APP_TAG, STATUS_MAX_CHARS } from './session';

export const HOST_API = 1;
export const CONTENT_MAX_BYTES = 64 * 1024;
export const STORAGE_MAX_BYTES = 256 * 1024;
export const BUCKET_SIZE = 20;
export const REFILL_PER_SECOND = 5;
export const TOAST_MAX_CHARS = 120;
export const TOAST_MIN_INTERVAL_MS = 3000;
const OP_RE = /^[a-z][a-z0-9-]{0,31}$/;

export type ErrorCode =
  | 'unsupported' | 'forbidden-op' | 'too-large' | 'bad-n' | 'rate-limited' | 'signed-out'
  | 'signer-rejected' | 'closed' | 'not-found' | 'unavailable' | 'hash-mismatch' | 'quota' | 'bad-request';

export interface HostParticipant {
  pubkey: string;
  name: string;
  avatar?: Blob;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface AppHostDeps {
  me: string | null;
  app: { address: string; title: string; version?: string; author: string };
  session: { id: string; channelId: string; createdBy: string; createdAt: number; channelName: string };
  paths: AppPath[];
  locale: 'en' | 'es' | 'pt';
  theme: { mode: 'dark' | 'light'; accent: string };
  connection: { connected: boolean; since: number | null };
  /** Sign and publish; resolves with the signed event. */
  publish(template: { kind: number; tags: string[][]; content: string }): Promise<NostrEvent>;
  loadPath(path: AppPath): Promise<Blob>;
  profile(pubkey: string): Promise<HostParticipant>;
  /** Per-user storage (localStorage in the app, a Map in tests). */
  storage: KeyValueStore;
  toast(text: string, tone: 'info' | 'error'): void;
  close(): void;
  resize?(height: number): void;
  /** Milliseconds; injectable for the rate bucket. */
  clockMs?(): number;
}

type Req = { id: number; type: string; [k: string]: unknown };

export class AppHost {
  private port: MessagePort | null = null;
  private tokens = BUCKET_SIZE;
  private lastRefill: number;
  private lastToast = Number.NEGATIVE_INFINITY;
  private closed = false;
  private readonly authors = new Set<string>();
  private readonly delivered = new Set<string>();
  private readonly storagePrefix: string;

  constructor(private readonly d: AppHostDeps) {
    this.lastRefill = this.now();
    this.storagePrefix = `obelisk-dex/app-storage/${d.app.address}/${d.me ?? 'anon'}/`;
  }

  private now(): number {
    return this.d.clockMs?.() ?? Date.now();
  }

  /** Take over the port handed to the frame's loader and send `init`. */
  attach(port: MessagePort, participants: HostParticipant[], backlog: NostrEvent[]): void {
    this.port = port;
    port.onmessage = (e: MessageEvent) => void this.handle(e.data as Req);
    port.start();
    this.push({
      type: 'init',
      api: HOST_API,
      app: this.d.app,
      session: {
        id: this.d.session.id,
        createdBy: this.d.session.createdBy,
        createdAt: this.d.session.createdAt,
        channelName: this.d.session.channelName,
      },
      me: this.d.me,
      participants,
      paths: this.d.paths.map((p) => p.path),
      locale: this.d.locale,
      theme: this.d.theme,
      limits: { contentBytes: CONTENT_MAX_BYTES, publishPerSecond: REFILL_PER_SECOND, storageBytes: STORAGE_MAX_BYTES },
      connection: this.d.connection,
    });
    this.pushEvents(backlog);
  }

  /** New session events from the relay (or our own echo). Duplicates are dropped. */
  pushEvents(events: readonly NostrEvent[]): void {
    const fresh = events
      .filter((ev) => !this.delivered.has(ev.id))
      .sort((a, b) => (a.created_at !== b.created_at ? a.created_at - b.created_at : a.id < b.id ? -1 : 1));
    if (fresh.length === 0) return;
    for (const ev of fresh) {
      this.delivered.add(ev.id);
      this.authors.add(ev.pubkey);
    }
    // Only fields the app needs; a structured clone of exactly these.
    this.push({
      type: 'events',
      events: fresh.map((ev) => ({
        id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at, kind: ev.kind, tags: ev.tags, content: ev.content, sig: ev.sig,
      })),
    });
  }

  pushParticipants(participants: HostParticipant[]): void {
    this.push({ type: 'participants', participants });
  }

  pushVisibility(visible: boolean): void {
    this.push({ type: 'visibility', visible });
  }

  pushEnv(env: { locale: 'en' | 'es' | 'pt'; theme: { mode: 'dark' | 'light'; accent: string } }): void {
    this.push({ type: 'env', ...env });
  }

  pushConnection(c: { connected: boolean; since: number | null }): void {
    this.push({ type: 'connection', ...c });
  }

  dispose(): void {
    this.closed = true;
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
    }
  }

  private push(msg: Record<string, unknown>): void {
    if (!this.closed) this.port?.postMessage(msg);
  }

  private reply(id: number, result?: unknown): void {
    this.push({ re: id, ok: true, ...(result !== undefined ? { result } : {}) });
  }

  private fail(id: number, error: ErrorCode, message?: string): void {
    this.push({ re: id, ok: false, error, ...(message ? { message: message.slice(0, 200) } : {}) });
  }

  private takeToken(): boolean {
    const now = this.now();
    this.tokens = Math.min(BUCKET_SIZE, this.tokens + ((now - this.lastRefill) / 1000) * REFILL_PER_SECOND);
    this.lastRefill = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  private async handle(req: Req): Promise<void> {
    // Malformed messages get no reply at all (host-api.md § Envelope).
    if (!req || typeof req !== 'object' || !Number.isInteger(req.id) || typeof req.type !== 'string') return;
    if (this.closed) return this.fail(req.id, 'closed');
    try {
      switch (req.type) {
        case 'publish': return await this.publish(req);
        case 'asset': return await this.asset(req);
        case 'storage.get': return this.storageGet(req);
        case 'storage.set': return this.storageSet(req);
        case 'profiles': return await this.profiles(req);
        case 'ui.toast': return this.toast(req);
        case 'ui.resize': {
          const h = Number(req.height);
          if (Number.isFinite(h)) this.d.resize?.(Math.min(720, Math.max(120, Math.round(h))));
          return this.reply(req.id);
        }
        case 'ui.close':
          this.reply(req.id);
          this.d.close();
          return;
        default:
          return this.fail(req.id, 'unsupported');
      }
    } catch (err) {
      this.fail(req.id, 'bad-request', err instanceof Error ? err.message : String(err));
    }
  }

  private async publish(req: Req): Promise<void> {
    const op = req.op;
    if (typeof op !== 'string' || !OP_RE.test(op) || op === 'create') return this.fail(req.id, 'forbidden-op');
    const content = req.content === undefined ? '' : req.content;
    if (typeof content !== 'string') return this.fail(req.id, 'bad-request');
    if (new TextEncoder().encode(content).length > CONTENT_MAX_BYTES) return this.fail(req.id, 'too-large');
    if (op === 'status') {
      let text: unknown;
      try { text = (JSON.parse(content) as { text?: unknown }).text; } catch { return this.fail(req.id, 'bad-request'); }
      if (typeof text !== 'string' || text.length > STATUS_MAX_CHARS) return this.fail(req.id, 'too-large');
    }
    const n = req.n;
    if (n !== undefined && !(typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return this.fail(req.id, 'bad-n');
    if (!this.d.me) return this.fail(req.id, 'signed-out');
    if (!this.takeToken()) return this.fail(req.id, 'rate-limited');

    const tags = [
      ['h', this.d.session.channelId],
      ['t', APP_TAG],
      ['op', op],
      ['e', this.d.session.id, '', 'root'],
      ...(n !== undefined ? [['n', String(n)]] : []),
    ];
    let ev: NostrEvent;
    try {
      ev = await this.d.publish({ kind: KIND_APP_SESSION, tags, content });
    } catch (err) {
      return this.fail(req.id, 'signer-rejected', err instanceof Error ? err.message : String(err));
    }
    this.reply(req.id, { id: ev.id, created_at: ev.created_at });
    // The app renders from the log, so our own event goes back through it now
    // rather than waiting for the relay's echo (which the dedupe will drop).
    this.pushEvents([ev]);
  }

  private async asset(req: Req): Promise<void> {
    const path = this.d.paths.find((p) => p.path === req.path);
    if (!path) return this.fail(req.id, 'not-found');
    try {
      this.reply(req.id, await this.d.loadPath(path));
    } catch (err) {
      this.fail(req.id, 'unavailable', err instanceof Error ? err.message : String(err));
    }
  }

  private storageKeys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.d.storage.length; i++) {
      const k = this.d.storage.key(i);
      if (k?.startsWith(this.storagePrefix)) out.push(k);
    }
    return out;
  }

  private storageGet(req: Req): void {
    if (typeof req.key !== 'string' || req.key.length > 128) return this.fail(req.id, 'bad-request');
    this.reply(req.id, this.d.storage.getItem(this.storagePrefix + req.key));
  }

  private storageSet(req: Req): void {
    if (typeof req.key !== 'string' || req.key.length > 128) return this.fail(req.id, 'bad-request');
    const full = this.storagePrefix + req.key;
    if (req.value === null) {
      this.d.storage.removeItem(full);
      return this.reply(req.id);
    }
    if (typeof req.value !== 'string') return this.fail(req.id, 'bad-request');
    let used = 0;
    for (const k of this.storageKeys()) {
      if (k === full) continue;
      used += k.length + (this.d.storage.getItem(k)?.length ?? 0);
    }
    if (used + full.length + req.value.length > STORAGE_MAX_BYTES) return this.fail(req.id, 'quota');
    try {
      this.d.storage.setItem(full, req.value);
    } catch {
      return this.fail(req.id, 'quota');
    }
    this.reply(req.id);
  }

  private async profiles(req: Req): Promise<void> {
    const pubkeys = Array.isArray(req.pubkeys) ? (req.pubkeys as unknown[]).slice(0, 32).map(String) : [];
    const out = await Promise.all(pubkeys.map(async (pk) => {
      // Only people who took part: the host must not become a way for an app
      // to look up arbitrary profiles.
      if (!this.authors.has(pk)) return { pubkey: pk, name: `npub…${pk.slice(-4)}` };
      try { return await this.d.profile(pk); } catch { return { pubkey: pk, name: `npub…${pk.slice(-4)}` }; }
    }));
    this.reply(req.id, out);
  }

  private toast(req: Req): void {
    const now = this.now();
    if (typeof req.text !== 'string' || req.text.trim().length === 0) return this.fail(req.id, 'bad-request');
    if (now - this.lastToast < TOAST_MIN_INTERVAL_MS) return this.fail(req.id, 'rate-limited');
    this.lastToast = now;
    // Prefixed with the app's title so a toast can never pose as Obelisk.
    this.d.toast(`${this.d.app.title}: ${req.text.slice(0, TOAST_MAX_CHARS)}`, req.tone === 'error' ? 'error' : 'info');
    this.reply(req.id);
  }
}
