import { afterEach, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import type { BridgeImpl } from '@/services/nostr-bridge';
import { sendZap } from '@/services/wallet/send-zap';

// Exercise the installed SDK, not a mock of requestZapInvoice. Mock only
// network/wallet boundaries so this test cannot transfer money or post events.
afterEach(() => {
  unregisterBridge();
  delete window.webln;
  vi.unstubAllGlobals();
});

it('requests a parseable zap invoice before paying through the active extension', async () => {
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const recipient = 'ab'.repeat(32);
  const signEvent = vi.fn(async (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, secret));
  const publishEvent = vi.fn<BridgeImpl['publishEvent']>(async (template) => finalizeEvent({ ...template, created_at: Math.floor(Date.now() / 1000) }, secret));
  registerBridge(fakeBridge({ myPubkey: pubkey, myLoginMethod: 'nip07' }, { publishEvent }));
  const sendPayment = vi.fn(async () => ({ preimage: 'test-preimage' }));
  window.webln = { enable: vi.fn(async () => {}), sendPayment };
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/.well-known/lnurlp/alice') {
      return Response.json({ callback: 'https://pay.example/callback', allowsNostr: true, minSendable: 1000, maxSendable: 1000000 });
    }
    expect(url.href.startsWith('https://pay.example/callback?')).toBe(true);
    expect(sendPayment).not.toHaveBeenCalled();
    const zap = JSON.parse(url.searchParams.get('nostr')!);
    expect(verifyEvent(zap)).toBe(true);
    expect(zap.tags).toContainEqual(['p', recipient]);
    expect(zap.tags).toContainEqual(['amount', '21000']);
    expect(zap.content).toBe('Gracias ⚡ + 100%');
    return Response.json({ pr: 'lnbc-test-invoice' });
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(sendZap({
    recipient: { recipientPubkey: recipient, groupId: 'test-group' },
    amountSats: 21, comment: 'Gracias ⚡ + 100%', lud16: 'alice@example.com',
    signer: { pubkey, signEvent }, currentRelay: 'wss://relay.example',
  })).resolves.toEqual({ markerError: null });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(sendPayment).toHaveBeenCalledExactlyOnceWith('lnbc-test-invoice');
  expect(publishEvent).toHaveBeenCalledTimes(1);
});
