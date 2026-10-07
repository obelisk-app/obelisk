/**
 * A fake Nostr Wallet Connect wallet service living on a fake relay.
 *
 * It sits on `FakeRelayFactory` (`src/lib/relay-hub/fake-relay.ts`): every
 * `FakeRelay` the hub creates for the wallet relay gets the wallet's
 * behaviour wrapped around it. Nothing here opens a socket.
 *
 * - A REQ for the info event (kind 13194) is answered with it, then EOSE.
 * - A REQ for answers (kind 23195) gets EOSE at once (the answer is
 *   ephemeral: it reaches only a REQ that is already live).
 * - A published request (kind 23194) is decrypted with the wallet's key in
 *   the scheme its tags name, handed to `respond`, and answered as a signed
 *   kind 23195 to every live REQ that matches, unless `respond` says
 *   `'silent'` (a wallet that never answers).
 * - `requireAuth`: the relay challenges every new socket and CLOSEs every
 *   REQ `auth-required:` until the socket has sent an AUTH, which it then
 *   accepts.
 */
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools/pure';
import * as nip04 from 'nostr-tools/nip04';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { normalizeURL } from 'nostr-tools/utils';
import type { Filter } from 'nostr-tools';
import { FakeRelay, FakeRelayFactory } from '@/lib/relay-hub';
import type { Identity } from '@/lib/relay-hub';
import { KIND_NWC_INFO, KIND_NWC_REQUEST, KIND_NWC_RESPONSE } from '@/constants/nostr/nip-kinds';

export type WalletReply =
  | { result: Record<string, unknown> }
  | { error: { code: string; message: string } }
  | 'silent';

export interface WalletRequest {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly event: NostrEvent;
  readonly encryption: 'nip44_v2' | 'nip04';
}

export interface FakeWalletOptions {
  relay?: string;
  /** The info event's methods. Default: pay_invoice get_info get_budget. */
  methods?: string;
  /** The info event's `encryption` tag value, or null for no tag (NIP-04 only). */
  encryption?: string | null;
  /** Publish no info event at all. */
  noInfo?: boolean;
  requireAuth?: boolean;
  /** Send an AUTH challenge on every new socket without requiring it (many relays do). Implied by `requireAuth`. */
  challenge?: boolean;
  lud16?: string;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export class FakeNwcWallet {
  readonly relayUrl: string;
  readonly walletSecret = generateSecretKey();
  readonly walletPubkey = getPublicKey(this.walletSecret);
  readonly clientSecret = generateSecretKey();
  readonly clientSecretHex = hex(this.clientSecret);
  readonly clientPubkey = getPublicKey(this.clientSecret);
  readonly requests: WalletRequest[] = [];
  readonly relays: FakeRelay[] = [];
  /** What the wallet answers. Default: pays every invoice, names itself, reports a budget. */
  respond: (req: WalletRequest) => WalletReply = (req) => {
    if (req.method === 'pay_invoice') return { result: { preimage: 'ab'.repeat(32), fees_paid: 0 } };
    if (req.method === 'get_info') return { result: { alias: 'Test Wallet', methods: ['pay_invoice'] } };
    if (req.method === 'get_budget') return { result: { used_budget: 21_000, total_budget: 100_000, renewal_period: 'monthly' } };
    return { error: { code: 'NOT_IMPLEMENTED', message: 'no' } };
  };

  constructor(private readonly opts: FakeWalletOptions = {}) {
    this.relayUrl = normalizeURL(opts.relay ?? 'wss://wallet-relay.example');
  }

  /** The connection link the wallet hands out. */
  get uri(): string {
    const lud16 = this.opts.lud16 ? `&lud16=${encodeURIComponent(this.opts.lud16)}` : '';
    return `nostr+walletconnect://${this.walletPubkey}?relay=${encodeURIComponent(this.relayUrl)}&secret=${this.clientSecretHex}${lud16}`;
  }

  infoEvent(): NostrEvent {
    const tags = this.opts.encryption === null ? [] : [['encryption', this.opts.encryption ?? 'nip44_v2 nip04']];
    return finalizeEvent({
      kind: KIND_NWC_INFO,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: this.opts.methods ?? 'pay_invoice get_info get_budget',
    }, this.walletSecret);
  }

  /** Wrap `factory.create` so the hub's sockets to the wallet relay behave like the wallet's relay. */
  attach(factory: FakeRelayFactory): (url: string, identity: Identity) => FakeRelay {
    return (url, identity) => {
      const relay = factory.create(url, identity);
      if (normalizeURL(url) === this.relayUrl) this.wire(relay);
      return relay;
    };
  }

  private authed(relay: FakeRelay): boolean {
    return !this.opts.requireAuth || relay.sentAuth.length > 0;
  }

  private wire(relay: FakeRelay): void {
    this.relays.push(relay);
    const subscribe = relay.subscribe.bind(relay);
    const publish = relay.publish.bind(relay);
    const connect = relay.connect.bind(relay);
    relay.connect = async () => {
      await connect();
      if (this.opts.requireAuth || this.opts.challenge) relay.challenge('wallet-relay-challenge');
    };
    relay.subscribe = (filters, params) => {
      const sub = subscribe(filters, params);
      queueMicrotask(() => {
        if (!relay.subs.has(sub.id)) return;
        if (!this.authed(relay)) {
          relay.closed(sub.id, 'auth-required: this relay serves wallets it knows');
          return;
        }
        if (!this.opts.noInfo && filters.some((f: Filter) => f.kinds?.includes(KIND_NWC_INFO))) relay.emit(this.infoEvent(), sub.id);
        relay.eose(sub.id);
      });
      return sub;
    };
    relay.publish = (event) => {
      if (!this.authed(relay)) {
        relay.published.push(event);
        return Promise.reject(new Error('auth-required: authenticate first'));
      }
      const acked = publish(event);
      if (event.kind === KIND_NWC_REQUEST) queueMicrotask(() => this.handle(relay, event));
      return acked;
    };
    const auth = relay.auth.bind(relay);
    relay.auth = (sign) => {
      const out = auth(sign);
      // Accept once the signed AUTH is out (the fake records it a microtask later).
      void Promise.resolve().then(() => Promise.resolve()).then(() => relay.acceptAuth());
      return out;
    };
  }

  private handle(relay: FakeRelay, event: NostrEvent): void {
    const nip44Tag = event.tags.some((t) => t[0] === 'encryption' && t[1] === 'nip44_v2');
    const encryption = nip44Tag ? 'nip44_v2' : 'nip04';
    const key = nip44.utils.getConversationKey(this.walletSecret, event.pubkey);
    const plain = encryption === 'nip44_v2'
      ? nip44.decrypt(event.content, key)
      : nip04.decrypt(this.walletSecret, event.pubkey, event.content);
    const { method, params } = JSON.parse(plain) as { method: string; params: Record<string, unknown> };
    const request: WalletRequest = { method, params, event, encryption };
    this.requests.push(request);
    const reply = this.respond(request);
    if (reply === 'silent') return;
    const body = JSON.stringify({ result_type: method, error: 'error' in reply ? reply.error : null, result: 'result' in reply ? reply.result : null });
    const content = encryption === 'nip44_v2' ? nip44.encrypt(body, key) : nip04.encrypt(this.walletSecret, event.pubkey, body);
    relay.emit(finalizeEvent({
      kind: KIND_NWC_RESPONSE,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', event.pubkey], ['e', event.id]],
      content,
    }, this.walletSecret));
  }

  /** Every request of one method. */
  calls(method: string): WalletRequest[] {
    return this.requests.filter((r) => r.method === method);
  }
}
