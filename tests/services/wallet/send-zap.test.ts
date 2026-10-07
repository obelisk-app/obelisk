import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  isWebLNAvailable: vi.fn(() => true),
  requestZapInvoice: vi.fn(),
}));
const bridge = vi.hoisted(() => ({ getBridgeImpl: vi.fn() }));

vi.mock('@nostr-wot/wallet', () => wallet);
vi.mock('@nostr-wot/data', () => ({ getDefaultRelays: () => ['wss://default.example', 'not-a-relay'] }));
vi.mock('@/services/nostr-bridge', () => ({
  getBridgeImpl: bridge.getBridgeImpl,
  isImportableRelayUrl: (u: string) => u.startsWith('wss://'),
}) satisfies Partial<typeof import('@/services/nostr-bridge')>);

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
let publishEvent: ReturnType<typeof vi.fn>;

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
  publishEvent = vi.fn(async () => { calls.push('publish'); });
  bridge.getBridgeImpl.mockReturnValue({ publishEvent });
});

afterEach(() => {
  delete window.webln;
  vi.clearAllMocks();
});

describe('checkZap', () => {
  it('reports the first missing piece, in the order the user can fix them', () => {
    expect(checkZap(draft({ lud16: null, signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'noAddress' });
    wallet.isWebLNAvailable.mockReturnValue(false);
    expect(checkZap(draft({ signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'noWallet' });
    wallet.isWebLNAvailable.mockReturnValue(true);
    expect(checkZap(draft({ signer: null, amountSats: 0 }))).toEqual({ ok: false, reason: 'invalidAmount' });
    expect(checkZap(draft({ amountSats: -5 }))).toEqual({ ok: false, reason: 'invalidAmount' });
    expect(checkZap(draft({ signer: null }))).toEqual({ ok: false, reason: 'noSigner' });
  });

  it('passes a complete draft through', () => {
    const check = checkZap(draft());
    expect(check.ok).toBe(true);
  });
});

describe('sendZap', () => {
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
    bridge.getBridgeImpl.mockReturnValue(null);
    await expect(sendZap(ready())).resolves.toEqual({ markerError: 'no-bridge' });
    expect(webln.sendPayment).toHaveBeenCalledTimes(1);
  });
});
