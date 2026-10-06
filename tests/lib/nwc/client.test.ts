/**
 * The NIP-47 client on its own, over a transport made straight from one
 * fake relay (no hub): encryption choice, answers, wallet errors, timeouts,
 * and what each failure promises about money.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { FakeRelayFactory, type FakeRelay } from '@/lib/relay-hub';
import { NWC_KINDS, NwcClient, NwcError, mayHavePaid, parseNwcUri, type NwcTransport } from '@/lib/nwc';
import { FakeNwcWallet, type FakeWalletOptions } from '@tests/support/fake-nwc-wallet';

const IDENTITY = { id: 'nwc:test', pubkey: null, signer: null, authPolicy: 'never-auth' as const };

function relayTransport(relay: FakeRelay, opts: { publishFails?: boolean } = {}): NwcTransport {
  return {
    subscribe(filter: Filter, h) {
      const sub = relay.subscribe([filter], { onevent: h.onEvent, oneose: h.onReady });
      return { close: () => sub.close() };
    },
    publish: (event: NostrEvent) => (opts.publishFails ? Promise.resolve(false) : relay.publish(event).then(() => true, () => false)),
    query: (filter: Filter) => new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const sub = relay.subscribe([filter], {
        onevent: (e) => events.push(e),
        oneose: () => { sub.close(); resolve(events); },
      });
    }),
  };
}

async function setup(walletOpts: FakeWalletOptions = {}, transportOpts: { publishFails?: boolean } = {}) {
  const wallet = new FakeNwcWallet(walletOpts);
  const relay = wallet.attach(new FakeRelayFactory())(wallet.relayUrl, IDENTITY);
  await relay.connect();
  const client = new NwcClient(parseNwcUri(wallet.uri), relayTransport(relay, transportOpts), {
    infoMs: 1_000, readyMs: 500, payMs: 5_000, callMs: 1_000,
  });
  return { wallet, relay, client };
}

async function rejection(promise: Promise<unknown>): Promise<NwcError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(NwcError);
    return e as NwcError;
  }
  throw new Error('expected a rejection');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('NwcClient', () => {
  it('pays an invoice in NIP-44 when the wallet offers it, signed by the client key, with an expiration', async () => {
    const { wallet, client } = await setup();
    const paid = await client.payInvoice('lnbc1invoice');

    expect(paid.preimage).toBe('ab'.repeat(32));
    const [req] = wallet.calls('pay_invoice');
    expect(req.params).toEqual({ invoice: 'lnbc1invoice' });
    expect(req.encryption).toBe('nip44_v2');
    expect(req.event.pubkey).toBe(wallet.clientPubkey);
    expect(req.event.tags).toContainEqual(['p', wallet.walletPubkey]);
    const expiration = Number(req.event.tags.find((t) => t[0] === 'expiration')?.[1]);
    expect(expiration).toBeGreaterThan(req.event.created_at);
  });

  it('speaks NIP-04 to a wallet whose info event names no encryption', async () => {
    const { wallet, client } = await setup({ encryption: null });
    await client.payInvoice('lnbc1invoice');
    expect(wallet.calls('pay_invoice')[0].encryption).toBe('nip04');
    expect(wallet.calls('pay_invoice')[0].event.tags.some((t) => t[0] === 'encryption')).toBe(false);
  });

  it('reads the alias and the budget only when the connection may ask for them', async () => {
    const { client } = await setup();
    expect(await client.walletAlias()).toBe('Test Wallet');
    expect(await client.budget()).toEqual({ usedMsats: 21_000, totalMsats: 100_000, renewsAt: null, renewalPeriod: 'monthly' });

    const limited = await setup({ methods: 'pay_invoice' });
    expect(await limited.client.walletAlias()).toBeNull();
    expect(await limited.client.budget()).toBeNull();
    expect(limited.wallet.requests).toEqual([]);
  });

  it('turns a wallet error into our code, and says nothing was paid', async () => {
    const { wallet, client } = await setup();
    wallet.respond = () => ({ error: { code: 'INSUFFICIENT_BALANCE', message: 'broke' } });
    const err = await rejection(client.payInvoice('lnbc1invoice'));
    expect(err.code).toBe('wallet-insufficient-balance');
    expect(err.walletCode).toBe('INSUFFICIENT_BALANCE');
    expect(err.outcome).toBe('not-paid');
    expect(mayHavePaid(err)).toBe(false);
  });

  it('times out a silent wallet as "may have paid"', async () => {
    const { wallet, client } = await setup();
    wallet.respond = () => 'silent';
    vi.useFakeTimers();
    const pending = rejection(client.payInvoice('lnbc1invoice'));
    await vi.advanceTimersByTimeAsync(5_001);
    const err = await pending;
    expect(err.code).toBe('wallet-timeout');
    expect(mayHavePaid(err)).toBe(true);
    expect(wallet.calls('pay_invoice')).toHaveLength(1);
  });

  it('reports a request no relay took as not paid', async () => {
    const { wallet, client } = await setup({}, { publishFails: true });
    const err = await rejection(client.payInvoice('lnbc1invoice'));
    expect(err.code).toBe('wallet-relay-failed');
    expect(err.outcome).toBe('not-paid');
    expect(wallet.requests).toEqual([]);
  });

  it('refuses a wallet with no info event, and a connection that may not pay', async () => {
    expect((await rejection((await setup({ noInfo: true })).client.payInvoice('lnbc1'))).code).toBe('nwc-unreachable');
    const noPay = await setup({ methods: 'get_info get_balance' });
    expect((await rejection(noPay.client.payInvoice('lnbc1'))).code).toBe('nwc-cannot-pay');
    expect(noPay.wallet.requests).toEqual([]);
  });

  it('ignores an answer to another request and an answer from another key', async () => {
    const { wallet, relay, client } = await setup();
    wallet.respond = () => 'silent';
    vi.useFakeTimers();
    const pending = rejection(client.payInvoice('lnbc1invoice'));
    await vi.advanceTimersByTimeAsync(10);
    const req = wallet.calls('pay_invoice')[0].event;
    const { finalizeEvent, generateSecretKey } = await import('nostr-tools/pure');
    // Signed by a stranger, tagged as the answer: must not settle the call.
    relay.emit(finalizeEvent({ kind: NWC_KINDS.response, created_at: req.created_at, tags: [['p', wallet.clientPubkey], ['e', req.id]], content: 'x' }, generateSecretKey()));
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await pending).code).toBe('wallet-timeout');
  });
});
