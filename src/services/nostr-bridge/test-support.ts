/**
 * Shared harness for the bridge tests that count what the user would see:
 * signer prompts and sockets. Imports vitest and the bridge's own files,
 * like `relay-hub/test-support.ts` does for the hub. Not a test file.
 *
 * No `SimplePool` is faked here. The real nostr-tools pool and relay run
 * over `FakeRelaySocket`, a fake WebSocket that behaves like a NIP-42
 * relay: it challenges on open, refuses every REQ that beats the AUTH with
 * `CLOSED auth-required:`, and accepts REQs and EVENTs after a valid kind
 * 22242. Prompts are counted on a NIP-07 signer spy, so a signature is a
 * prompt the user would have seen. `relay-hub-bridge.test.ts`,
 * `voice-auth.test.ts` and `background-watch-prompts.test.ts` run on it.
 */
import { afterEach, beforeEach, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Event as NostrEvent, EventTemplate, VerifiedEvent } from 'nostr-tools';
import { unregisterBridge } from './bridge-slot';

export type Frame = unknown[];

interface SocketHandlers {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: ((ev: { message?: string }) => void) | null;
}

/**
 * One relay socket. Each instance is a new socket generation with its own
 * challenge, exactly as a relay issues them.
 */
export class FakeRelaySocket implements SocketHandlers {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static sockets: FakeRelaySocket[] = [];
  static seq = 0;

  readonly url: string;
  readonly challenge: string;
  readyState = FakeRelaySocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { message?: string }) => void) | null = null;
  /** Every frame the client sent, parsed. */
  readonly sent: Frame[] = [];
  authed = false;

  constructor(url: string) {
    this.url = url;
    FakeRelaySocket.seq += 1;
    this.challenge = `challenge-${FakeRelaySocket.seq}`;
    FakeRelaySocket.sockets.push(this);
    // The handshake completes on its own, like a reachable relay.
    queueMicrotask(() => this.open());
  }

  static forUrl(url: string): FakeRelaySocket[] {
    return FakeRelaySocket.sockets.filter((s) => s.url === url);
  }

  static reset(): void {
    FakeRelaySocket.sockets = [];
    FakeRelaySocket.seq = 0;
  }

  open(): void {
    if (this.readyState !== FakeRelaySocket.CONNECTING) return;
    this.readyState = FakeRelaySocket.OPEN;
    this.onopen?.();
    this.reply(['AUTH', this.challenge]);
  }

  send(data: string): void {
    const frame = JSON.parse(data) as Frame;
    this.sent.push(frame);
    const [kind, a, b] = frame;
    if (kind === 'REQ') {
      const id = String(a);
      if (!this.authed) this.reply(['CLOSED', id, 'auth-required: this relay only serves authenticated clients']);
      else this.reply(['EOSE', id]);
      return;
    }
    if (kind === 'AUTH') {
      const ev = a as NostrEvent;
      const names = ev.tags.find((t) => t[0] === 'challenge')?.[1] === this.challenge;
      if (ev.kind === 22242 && names) this.authed = true;
      this.reply(['OK', ev.id, names, names ? '' : 'auth-required: wrong challenge']);
      return;
    }
    if (kind === 'EVENT') {
      const ev = a as NostrEvent;
      this.reply(['OK', ev.id, true, '']);
      return;
    }
    void b;
  }

  close(): void {
    this.readyState = FakeRelaySocket.CLOSED;
    this.onclose?.({});
  }

  /** The transport drops without a CLOSE handshake. */
  drop(): void {
    if (this.readyState !== FakeRelaySocket.OPEN) return;
    this.readyState = FakeRelaySocket.CLOSED;
    this.onclose?.({ message: 'dropped' });
  }

  /** Frames of one kind the client sent on this socket. */
  frames(kind: string): Frame[] {
    return this.sent.filter((f) => f[0] === kind);
  }

  private reply(frame: Frame): void {
    queueMicrotask(() => {
      if (this.readyState !== FakeRelaySocket.OPEN) return;
      this.onmessage?.({ data: JSON.stringify(frame) });
    });
  }
}

/** Walk the fake clock in `rounds` steps of `ms`, draining microtasks between them. */
export async function settle(ms = 50, rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(ms);
    for (let j = 0; j < 8; j++) await Promise.resolve();
  }
}

export function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Kind 22242 signatures the NIP-07 spy was asked for: one per prompt the user saw. */
export const authPrompts = (signEvent: { mock: { calls: unknown[][] } }): number =>
  signEvent.mock.calls.filter((call) => (call[0] as EventTemplate).kind === 22242).length;

/**
 * Register the page the counting tests run on: `FakeRelaySocket` as the
 * page's WebSocket (any pool the bridge built besides the hub's would
 * construct it through the global, so a second socket set to the same URL
 * is counted rather than hidden), fresh modules, fake timers, and the hub
 * created first on the fake transport so the bridge's own `getRelayHub`
 * call finds it (options bind on the first call). The `afterEach` disposes
 * and unregisters the bridge and restores the setup guard through
 * `unstubAllGlobals`.
 */
export function installFakeRelayPage(): void {
  beforeEach(async () => {
    vi.stubGlobal('WebSocket', FakeRelaySocket);
    // The bridge's globalThis slot survives a module reset, so it is emptied
    // explicitly; the reset stays for the hub, which must be created fresh on
    // the fake transport below.
    unregisterBridge();
    vi.resetModules();
    FakeRelaySocket.reset();
    window.localStorage.clear();
    vi.useFakeTimers();
    const hubMod = await import('@/lib/relay-hub');
    hubMod.getRelayHub({
      connectTimeoutMs: 10_000,
      transport: { websocketImplementation: FakeRelaySocket as unknown as typeof WebSocket, enablePing: false },
    });
  });

  afterEach(async () => {
    const { getBridgeImpl } = await import('./client');
    getBridgeImpl()?.dispose();
    unregisterBridge();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}

export interface Nip07Login {
  readonly pk: string;
  /** The NIP-07 spy; `authPrompts(signEvent)` is what the user was asked for. */
  readonly signEvent: ReturnType<typeof vi.fn<(template: EventTemplate) => Promise<VerifiedEvent>>>;
  readonly bridge: Awaited<ReturnType<typeof import('./client').getBridge>>;
  readonly impl: NonNullable<ReturnType<typeof import('./client').getBridgeImpl>>;
  readonly hub: ReturnType<typeof import('@/lib/relay-hub').getRelayHub>;
}

/**
 * Log in through a NIP-07 signer spy and wait for the active relay's
 * handshake and AUTH to settle. Returns with exactly one prompt counted.
 */
export async function loginWithNip07Spy(): Promise<Nip07Login> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const signEvent = vi.fn(async (template: EventTemplate): Promise<VerifiedEvent> => finalizeEvent(template, sk));
  Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent, getPublicKey: async () => pk } });
  const { getBridge, getBridgeImpl } = await import('./client');
  const { getRelayHub } = await import('@/lib/relay-hub');
  const bridge = await getBridge();
  const login = bridge.loginWithNip07(pk);
  await settle();
  await login;
  await settle();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('bridge not constructed');
  return { pk, signEvent, bridge, impl, hub: getRelayHub() };
}
