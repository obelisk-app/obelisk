/**
 * The NIP-46 remote signer's lifecycle (round 4 plan, step 18,
 * `session/signer.ts`, the bunker half): the active `BunkerSigner`, its lazy
 * rehydration from the persisted session, the readiness store, and the
 * serialized runner every bunker round-trip goes through. Pure move from
 * `client.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import { BunkerSigner, parseBunkerInput } from 'nostr-tools/nip46';
import type { BridgeContext } from '../facade/context';
import { hexToBytes } from '../common/hex';
import { enqueueSignerOp, type SignerLane } from './signer-queue';
import { StateStore } from '../common/state-store';
import { withDeadline } from '../common/with-deadline';

export type RemoteSigner = Pick<
  BunkerSigner,
  'getPublicKey' | 'signEvent' | 'nip04Encrypt' | 'nip04Decrypt' | 'nip44Encrypt' | 'nip44Decrypt' | 'close'
>;

export const BUNKER_AUTH_SIGNATURE_TIMEOUT_MS = 45_000;

/** Options of {@link BunkerModule.run}. */
export interface BunkerRunOpts {
  lane?: SignerLane;
  label?: string;
  deadlineMs?: number;
  deadlineMessage?: string;
  /** See `enqueueSignerOp`: how long it may wait for the slot. */
  startDeadlineMs?: number;
}

export type BunkerContext = Pick<BridgeContext, 'session'>;

export class BunkerModule {
  /** Active NIP-46 signer (when loginMethod === 'bunker'). Reconstructed lazily. */
  signer: RemoteSigner | null = null;
  private recovery: Promise<RemoteSigner> | null = null;
  /** Set by the modal so it can show the auth-challenge URL. */
  onAuth: ((url: string) => void) | null = null;
  /**
   * `true` once the active NIP-46 bunker signer has completed its handshake
   * with the bunker relay (or the user logged in via nsec/NIP-07, those
   * methods don't have an external signer to wait for, so they never set this
   * to `true`; consumers that need a generic "ready to publish" flag should
   * derive it from `(loginMethod !== 'bunker') || bunkerSignerReady`).
   * Pre-warmed during `initialize` on page reload to avoid a cold
   * `BunkerSigner.connect()` round-trip during the first NIP-42 AUTH.
   */
  readonly ready = new StateStore<boolean>(false);

  constructor(private readonly ctx: BunkerContext) {}

  /** The `onauth` a bunker signer is built with: the modal's handler, else a popup. */
  readonly openAuthUrl = (url: string): void => {
    if (this.onAuth) this.onAuth(url);
    else if (typeof window !== 'undefined') window.open(url, '_blank', 'width=600,height=700');
  };

  /** Close and forget the active signer (logout). */
  close(): void {
    if (this.signer) {
      try { this.signer.close(); } catch { /* ignore */ }
      this.signer = null;
    }
  }

  /**
   * Lazily (re)construct the active BunkerSigner from the persisted session.
   *
   * Contract:
   *   - On a fresh login (`loginWithBunker` / `createNostrConnectSession`),
   *     the signer is constructed and connected eagerly before this method is
   *     ever consulted; `this.signer` is already set.
   *   - On page reload, `initialize()` pre-warms by calling this method once
   *     fire-and-forget. After it resolves, subsequent NIP-42 AUTH callbacks
   *     hit the cached signer instantly.
   *   - If pre-warm failed (bunker relay down) or `initialize` hasn't run yet,
   *     the first NIP-42 AUTH triggers this lazy path: parse bunker URL,
   *     reconstruct localSecret, build BunkerSigner, warm the RPC channel,
   *     then sign. This adds 1-3s of latency but is the fallback of last
   *     resort.
   */
  async ensure(): Promise<RemoteSigner> {
    if (this.signer) return this.signer;
    const session = this.ctx.session();
    if (!session || session.loginMethod !== 'bunker' || !session.bunkerUrl || !session.bunkerLocalSecretHex) {
      throw new CodedError('bunker-no-session', 'No bunker session to rehydrate');
    }
    const bp = await parseBunkerInput(session.bunkerUrl);
    if (!bp) throw new CodedError('bunker-no-session', 'Invalid stored bunker URL');
    // Read again after the await, as the facade did: a logout while the URL
    // was parsing throws here instead of rebuilding the old account's signer.
    const localSecret = hexToBytes(this.ctx.session()!.bunkerLocalSecretHex!);
    const signer = BunkerSigner.fromBunker(localSecret, bp, {
      onauth: (url) => this.openAuthUrl(url),
    });
    if (bp.secret) {
      await signer.connect();
    } else {
      // SDK QR logins persist a bunker URL synthesized from the paired signer
      // and relays; the original nostrconnect secret is not recoverable from
      // the SDK's public API. The client secret is the durable authorization,
      // so warm the RPC channel with get_public_key instead of sending a
      // bogus connect request with an empty secret.
      await signer.getPublicKey();
    }
    this.signer = signer;
    this.ready.set(true);
    return signer;
  }

  /**
   * Run `operation` against the active bunker signer, serialized through the
   * signer queue (see `../signer-queue.ts`). NIP-46 round-trips are the
   * slowest thing the app asks a signer to do, a full relay hop, sometimes a
   * user approval prompt, so background traffic (inbound wrap decrypts, WoT
   * lookups) must not sit in front of a message the user just sent.
   *
   * Two ordering rules are load-bearing here:
   *
   *   - `ensure()` runs **outside** the queued slot. Its lazy
   *     reconnect costs 1-3s; holding the single in-flight slot for that
   *     would block every other operation behind a reconnect that isn't a
   *     signer round-trip at all.
   *   - `deadlineMs`, when given, is applied **inside** the slot. A deadline
   *     wrapped around the whole call would start ticking at enqueue and
   *     could expire while the request is still waiting its turn, timing the
   *     queue instead of the signer.
   */
  async run<T>(operation: (signer: RemoteSigner) => Promise<T>, opts?: BunkerRunOpts): Promise<T> {
    const lane = opts?.lane ?? 'interactive';
    const label = opts?.label ?? 'bunker';
    const invoke = (s: RemoteSigner): Promise<T> =>
      enqueueSignerOp(lane, label, () =>
        opts?.deadlineMs
          ? withDeadline(operation(s), opts.deadlineMs, opts.deadlineMessage ?? 'Remote signer timed out') // i18n-exempt: developer message; withDeadline rejects with signer-timeout
          : operation(s),
        opts?.startDeadlineMs !== undefined ? { startDeadlineMs: opts.startDeadlineMs } : undefined,
      );
    const signer = await this.ensure();
    try {
      return await invoke(signer);
    } catch (error) {
      if (!(error instanceof Error) || !/signer is not open anymore/i.test(error.message)) throw error;
      if (this.signer === signer) {
        this.signer = null;
        this.ready.set(false);
      }
      this.recovery ??= this.ensure().finally(() => {
        this.recovery = null;
      });
      return invoke(await this.recovery);
    }
  }
}
