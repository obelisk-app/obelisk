/**
 * A NIP-47 client over a transport the caller owns.
 *
 * The client never opens a socket: it asks its `NwcTransport` to subscribe,
 * publish and query, so the app can route every frame through its own relay
 * layer (the app's RelayHub, under the client key's identity). Requests are
 * signed with the connection's client key, never anyone else's.
 *
 * One call:
 * 1. read the wallet's info event once (kind 13194) to learn the methods and
 *    the encryption (NIP-44 when offered, else NIP-04);
 * 2. open a live REQ for the answer (kind 23195 from the wallet, `#p` the
 *    client, `#e` the request) and wait for it to be live: the answer is an
 *    ephemeral event, so a relay will not keep it for a REQ opened late;
 * 3. publish the request (kind 23194) with an `expiration` tag, so a wallet
 *    that receives it after we stopped waiting does not act on it;
 * 4. resolve with `result`, or reject with an `NwcError` (see `./errors` for
 *    what `outcome` promises about money).
 *
 * No app imports: a mini-package.
 */
import { finalizeEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';
import { NwcError, codeForWalletError } from './errors';
import { decryptFrom, encryptFor } from './crypto';
import { NWC_KINDS, canPay, chooseEncryption, parseNwcInfo, type NwcInfo } from './info';
import type { NwcConnection } from './uri';

export interface NwcSubscription {
  close(): void;
}

export interface NwcTransport {
  /** A live REQ. `onReady` fires once a relay has answered EOSE (the REQ is live). */
  subscribe(filter: Filter, handlers: { onEvent(event: NostrEvent): void; onReady(): void }): NwcSubscription;
  /** False when no relay can have received the event (all refused or unreachable); true otherwise. */
  publish(event: NostrEvent): Promise<boolean>;
  /** A one-shot read, settled by EOSE or `maxWaitMs`. */
  query(filter: Filter, maxWaitMs: number): Promise<readonly NostrEvent[]>;
}

export interface NwcTimeouts {
  /** How long to wait for the info event. */
  readonly infoMs: number;
  /** How long to wait for the answer REQ to go live before publishing anyway. */
  readonly readyMs: number;
  /** How long a `pay_invoice` may take to be answered. */
  readonly payMs: number;
  /** How long any other call may take. */
  readonly callMs: number;
}

export const DEFAULT_NWC_TIMEOUTS: NwcTimeouts = { infoMs: 8_000, readyMs: 4_000, payMs: 60_000, callMs: 12_000 };

export interface NwcPayResult {
  readonly preimage: string | null;
  readonly feesPaidMsats: number | null;
}

/** What a wallet's `get_budget` answers, in millisats. */
export interface NwcBudget {
  readonly usedMsats: number;
  readonly totalMsats: number;
  readonly renewsAt: number | null;
  readonly renewalPeriod: string | null;
}

interface WalletAnswer {
  result_type?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown } | null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export class NwcClient {
  private info: Promise<NwcInfo> | null = null;

  constructor(
    readonly connection: NwcConnection,
    private readonly transport: NwcTransport,
    private readonly timeouts: NwcTimeouts = DEFAULT_NWC_TIMEOUTS,
  ) {}

  /** The wallet's info event, read once. `nwc-unreachable` when no relay has one. */
  fetchInfo(): Promise<NwcInfo> {
    if (!this.info) {
      const { walletPubkey } = this.connection;
      this.info = this.transport
        .query({ kinds: [NWC_KINDS.info], authors: [walletPubkey], limit: 1 }, this.timeouts.infoMs)
        .then((events) => {
          const newest = events
            .filter((e) => e.pubkey === walletPubkey && e.kind === NWC_KINDS.info)
            .sort((a, b) => b.created_at - a.created_at)[0];
          if (!newest) throw new NwcError('nwc-unreachable', 'not-paid');
          return parseNwcInfo(newest);
        });
      // A failed read is not cached: the next call asks again.
      this.info.catch(() => { this.info = null; });
    }
    return this.info;
  }

  async payInvoice(invoice: string): Promise<NwcPayResult> {
    const info = await this.fetchInfo();
    if (!canPay(info)) throw new NwcError('nwc-cannot-pay', 'not-paid');
    const result = await this.call('pay_invoice', { invoice }, this.timeouts.payMs) as Record<string, unknown> | null;
    return {
      preimage: typeof result?.preimage === 'string' ? result.preimage : null,
      feesPaidMsats: num(result?.fees_paid),
    };
  }

  /** `get_info`'s alias, when the connection may call it and the wallet sets one. */
  async walletAlias(): Promise<string | null> {
    const info = await this.fetchInfo();
    if (!info.methods.includes('get_info')) return null;
    const result = await this.call('get_info', {}, this.timeouts.callMs) as Record<string, unknown> | null;
    const alias = typeof result?.alias === 'string' ? result.alias.trim() : '';
    return alias || null;
  }

  /** `get_budget`, when the connection may call it and the wallet set a budget. */
  async budget(): Promise<NwcBudget | null> {
    const info = await this.fetchInfo();
    if (!info.methods.includes('get_budget')) return null;
    const result = await this.call('get_budget', {}, this.timeouts.callMs) as Record<string, unknown> | null;
    const total = num(result?.total_budget);
    if (total === null) return null;
    return {
      usedMsats: num(result?.used_budget) ?? 0,
      totalMsats: total,
      renewsAt: num(result?.renews_at),
      renewalPeriod: typeof result?.renewal_period === 'string' ? result.renewal_period : null,
    };
  }

  /** One request and its answer. Resolves with `result`; rejects with an `NwcError`. */
  async call(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const scheme = chooseEncryption(await this.fetchInfo());
    const { walletPubkey, clientPubkey, secret } = this.connection;
    const createdAt = Math.floor(Date.now() / 1000);
    const tags = [['p', walletPubkey], ['expiration', String(createdAt + Math.ceil(timeoutMs / 1000))]];
    if (scheme === 'nip44_v2') tags.push(['encryption', 'nip44_v2']);
    const request = finalizeEvent({
      kind: NWC_KINDS.request,
      created_at: createdAt,
      tags,
      content: encryptFor(scheme, secret, walletPubkey, JSON.stringify({ method, params })),
    }, secret);

    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      let sent = false;
      let sub: NwcSubscription | null = null;
      let answerTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        clearTimeout(answerTimer);
        sub?.close();
        settle();
      };
      const fail = (err: NwcError) => finish(() => reject(err));

      const onAnswer = (event: NostrEvent) => {
        if (event.pubkey !== walletPubkey || event.kind !== NWC_KINDS.response) return;
        if (!event.tags.some((t) => t[0] === 'e' && t[1] === request.id)) return;
        let answer: WalletAnswer;
        try {
          answer = JSON.parse(decryptFrom(scheme, secret, walletPubkey, event.content)) as WalletAnswer;
        } catch {
          // Sent, and the answer is unreadable: the wallet may have acted on it.
          fail(new NwcError('wallet-failed', 'unknown'));
          return;
        }
        if (answer.error) {
          const walletCode = typeof answer.error.code === 'string' ? answer.error.code : null;
          fail(new NwcError(codeForWalletError(walletCode), 'not-paid', walletCode));
          return;
        }
        finish(() => resolve(answer.result ?? null));
      };

      const send = () => {
        if (sent || settled) return;
        sent = true;
        clearTimeout(readyTimer);
        this.transport.publish(request).then(
          (reached) => {
            if (settled) return;
            if (!reached) {
              fail(new NwcError('wallet-relay-failed', 'not-paid'));
              return;
            }
            answerTimer = setTimeout(() => fail(new NwcError('wallet-timeout', 'unknown')), timeoutMs);
          },
          () => fail(new NwcError('wallet-relay-failed', 'not-paid')),
        );
      };

      const readyTimer = setTimeout(send, this.timeouts.readyMs);
      const opened = this.transport.subscribe(
        { kinds: [NWC_KINDS.response], authors: [walletPubkey], '#p': [clientPubkey], '#e': [request.id] },
        { onEvent: onAnswer, onReady: () => queueMicrotask(send) },
      );
      if (settled) opened.close();
      else sub = opened;
    });
  }
}
