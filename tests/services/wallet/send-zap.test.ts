import type { BridgeImpl } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  isWebLNAvailable: vi.fn(() => true),
  requestZapInvoice: vi.fn(),
}));
const bridge = vi.hoisted(() => ({ getBridgeImpl: vi.fn() }));

vi.mock('@nostr-wot/wallet', () => wallet);
vi.mock('@/services/wallet/lnurl-zap', () => ({ requestZapInvoice: wallet.requestZapInvoice }));
vi.mock('@nostr-wot/data', () => ({ getDefaultRelays: () => ['wss://default.example', 'not-a-relay'] }));
vi.mock('@/services/nostr-bridge', () => ({
  getBridgeImpl: bridge.getBridgeImpl,
  isImportableRelayUrl: (u: string) => u.startsWith('wss://'),
}) satisfies Partial<typeof import('@/services/nostr-bridge')>);

import { NwcError } from '@nostr-wot/wallet/nwc';
import { CodedError } from '@/utils/errors/codes';
import { checkZap, sendZap, ZapError, type ZapDraft } from '@/services/wallet/send-zap';
import { KIND_REACTION } from '@/constants/nostr/nip-kinds';

const RECIPIENT = 'c'.repeat(64);
const signer = { pubkey: 'a'.repeat(64), signEvent: vi.fn() };

function draft(over: Partial<ZapDraft> = {}): ZapDraft {
  return {
    recipient: { recipientPubkey: RECIPIENT, groupId: 'g1', messageId: 'm1' },
    amountSats: 21,
    comment: '  nice  ',
    lud16: 'ana@example.com',
    signer,
    currentRelay: 'wss://active.example',
    ...over,
  };
}

function ready() {
  const check = checkZap(draft());
  if (!check.ok) throw new Error('fixture should be valid');
  return check.zap;
}

let calls: string[];
let webln: {
  enable: ReturnType<typeof vi.fn<() => Promise<void>>>;
  sendPayment: ReturnType<typeof vi.fn<(invoice: string) => Promise<{ preimage: string }>>>;
};
let publishEvent: ReturnType<typeof vi.fn<BridgeImpl['publishEvent']>>;

beforeEach(() => {
  calls = [];
  webln = {
    enable: vi.fn<() => Promise<void>>(async () => { calls.push('enable'); }),
    sendPayment: vi.fn<(invoice: string) => Promise<{ preimage: string }>>(async () => { calls.push('pay'); return { preimage: 'p' }; }),
  };
  window.webln = webln;
  wallet.isWebLNAvailable.mockReturnValue(true);
  wallet.requestZapInvoice.mockImplementation(async () => {
    calls.push('invoice');
    return { invoice: 'lnbc1invoice', zapRequest: { id: 'zr' } };
  });
  publishEvent = vi.fn<BridgeImpl['publishEvent']>(async (template) => {
    calls.push('publish');
    return { ...template, created_at: 1, id: 'marker', sig: '', pubkey: signer.pubkey };
  });
  bridge.getBridgeImpl.mockReturnValue(fakeBridge({ myPubkey: signer.pubkey, myLoginMethod: 'nip07' }, { publishEvent, refreshUserMetadata: vi.fn(async () => ({ lud16: 'ana@example.com' } as never)) }));
});

afterEach(() => {
  delete window.webln;
  vi.clearAllMocks();
});

describe('checkZap', () => {
  it('reports the first missing piece, in the order the user can fix them', () => {
    expect(checkZap(draft({ lud16: null, signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'noWallet' });
    wallet.isWebLNAvailable.mockReturnValue(false);
    expect(checkZap(draft({ signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'noWallet' });
    wallet.isWebLNAvailable.mockReturnValue(true);
    expect(checkZap(draft({ signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'noWallet' });
    expect(checkZap(draft({ amountSats: -5 }))).toEqual({ ok: false, reason: 'invalidAmount' });
    expect(checkZap(draft({ signer: null }))).toEqual({ ok: false, reason: 'noWallet' });
  });

  it('passes a complete draft through', () => {
    const check = checkZap(draft());
    expect(check.ok).toBe(true);
  });
});

describe('sendZap', () => {
  it('traces one payment attempt without logging invoice or provider error payloads', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const failure = new Error('private-provider-payload');
    webln.sendPayment.mockRejectedValueOnce(failure);
    try {
      await expect(sendZap(ready())).rejects.toBe(failure);
      const rows = log.mock.calls.map(([, row]) => row);
      expect(new Set(rows.map(row => row.attempt)).size).toBe(1);
      expect(rows.filter(row => row.stage === 'payment-webln').map(row => row.status)).toEqual(['start', 'failed']);
      expect(JSON.stringify(rows)).not.toMatch(/lnbc1invoice|private-provider-payload|ana@example/);
      expect(webln.sendPayment).toHaveBeenCalledTimes(1);
      expect(publishEvent).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('enables the wallet, requests the invoice, pays, then posts the marker', async () => {
    const result = await sendZap(ready());

    expect(calls).toEqual(['enable', 'invoice', 'pay', 'publish']);
    expect(result).toEqual({ markerError: null });

    const [, args] = wallet.requestZapInvoice.mock.calls[0];
    expect(args).toEqual({
      recipientPubkey: RECIPIENT,
      lud16: 'ana@example.com',
      eventId: 'm1',
      amountMsats: 21_000,
      relays: ['wss://active.example', 'wss://default.example'],
      comment: 'nice',
    });
    expect(webln.sendPayment).toHaveBeenCalledWith('lnbc1invoice');
    expect(publishEvent).toHaveBeenCalledWith(
      {
        kind: KIND_REACTION,
        content: '⚡',
        tags: [
          ['e', 'm1'],
          ['p', RECIPIENT],
          ['h', 'g1'],
          ['amount', '21000', 'msat'],
          ['bolt11', 'lnbc1invoice'],
          ['description', JSON.stringify({ id: 'zr' })],
        ],
      },
      { extraRelays: ['wss://active.example'] },
    );
  });

  it('refuses before any request when the wallet disappeared since the check', async () => {
    const zap = ready();
    delete window.webln;
    await expect(sendZap(zap)).rejects.toEqual(new ZapError('noWallet'));
    expect(wallet.requestZapInvoice).not.toHaveBeenCalled();
  });

  it('surfaces a failed payment and posts no marker', async () => {
    webln.sendPayment.mockRejectedValue(new Error('user rejected'));
    await expect(sendZap(ready())).rejects.toThrow('user rejected');
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('reports a marker that failed to publish as a sent zap, not a failure', async () => {
    publishEvent.mockRejectedValue(new Error('relay said no'));
    await expect(sendZap(ready())).resolves.toEqual({ markerError: 'relay said no' });
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('hands back the code, not the English, when the marker publish was coded', async () => {
    publishEvent.mockRejectedValue(new CodedError('publish-rejected', 'Relay rejected event (kind 7). blocked'));
    await expect(sendZap(ready())).resolves.toEqual({ markerError: 'publish-rejected' });
  });

  // Regression: this used to throw after the payment had already gone through,
  // so the modal showed an error and stayed open with Zap pressable again.
  it('does not report a paid zap as failed when the bridge is not ready', async () => {
    webln.sendPayment.mockImplementationOnce(async () => { bridge.getBridgeImpl.mockReturnValue(null); return { preimage: 'p' }; });
    await expect(sendZap(ready())).resolves.toEqual({ markerError: 'no-bridge' });
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });
});

describe('shared zap payment guards', () => {
  it('blocks a concurrent payment to the same message even when its amount differs', async () => {
    let finish!: (value: { invoice: string; zapRequest: unknown }) => void;
    wallet.requestZapInvoice.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = sendZap(ready());
    await expect(sendZap({ ...ready(), amountSats: 1000 })).rejects.toMatchObject({ code: 'pending' });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    finish({ invoice: 'lnbc1invoice', zapRequest: {} });
    await first;
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });

  it('keeps an uncertain payment locked across entry points until its session ends', async () => {
    webln.sendPayment.mockRejectedValueOnce(new NwcError('wallet-timeout', 'unknown'));
    await expect(sendZap(ready())).rejects.toMatchObject({ outcome: 'unknown' });
    await expect(sendZap(ready())).rejects.toMatchObject({ code: 'unconfirmed' });
    expect(wallet.requestZapInvoice).toHaveBeenCalledTimes(1);
    bridge.getBridgeImpl.mockReturnValue(fakeBridge({ myPubkey: signer.pubkey, myLoginMethod: 'nip07' }, { publishEvent, refreshUserMetadata: vi.fn(async () => ({ lud16: 'ana@example.com' } as never)) }));
    await expect(sendZap(ready())).resolves.toEqual({ markerError: null });
  });

  it('rejects self-zaps and nonintegral amounts before paying', () => {
    expect(checkZap(draft({ recipient: { recipientPubkey: signer.pubkey, groupId: 'g' } }))).toMatchObject({ ok: false, reason: 'self' });
    expect(checkZap(draft({ amountSats: 1.5 }))).toMatchObject({ ok: false, reason: 'invalidAmount' });
  });
});

it('refreshes an outdated address before requesting the invoice', async () => {
  bridge.getBridgeImpl().refreshUserMetadata.mockResolvedValue({ lud16: 'new@example.com' });
  await sendZap(ready());
  expect(wallet.requestZapInvoice.mock.calls.at(-1)?.[1].lud16).toBe('new@example.com');
});

it('never signs or pays when profile refresh is incomplete', async () => {
  bridge.getBridgeImpl().refreshUserMetadata.mockRejectedValue(new CodedError('profile-lookup-timeout', 'timeout'));
  await expect(sendZap(ready())).rejects.toMatchObject({ code: 'profile-lookup-timeout' });
  expect(wallet.requestZapInvoice).not.toHaveBeenCalled();
  expect(webln.sendPayment).not.toHaveBeenCalled();
});

it('does not resurrect an address removed by the latest profile', async () => {
  bridge.getBridgeImpl().refreshUserMetadata.mockResolvedValue({ lud16: null });
  await expect(sendZap(ready())).rejects.toMatchObject({ code: 'noAddress' });
  expect(wallet.requestZapInvoice).not.toHaveBeenCalled();
  expect(webln.sendPayment).not.toHaveBeenCalled();
});

it('stops an account change during profile refresh before requesting an invoice', async () => {
  let finish!: (profile: unknown) => void;
  bridge.getBridgeImpl().refreshUserMetadata.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const pending = sendZap(ready());
  bridge.getBridgeImpl.mockReturnValue(null);
  finish({ lud16: 'new@example.com' });
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(wallet.requestZapInvoice).not.toHaveBeenCalled();
  expect(webln.sendPayment).not.toHaveBeenCalled();
});
