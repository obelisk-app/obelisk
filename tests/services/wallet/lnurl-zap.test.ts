import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestZapInvoice } from '@/services/wallet/lnurl-zap';
const sdk = vi.hoisted(() => ({ fetchLnurlPayMetadata: vi.fn(), buildZapRequest: vi.fn() }));
vi.mock('@nostr-wot/wallet', () => sdk);
vi.mock('@/i18n/runtime', () => ({ translate: (key: string, values?: Record<string, string>) => JSON.stringify({ key, ...values }) }));
const fetchImpl = vi.fn();
const signer = { getPublicKey: vi.fn(), signEvent: vi.fn() };
const args = { recipientPubkey: 'b'.repeat(64), lud16: 'bob@example.com', amountMsats: 21000, relays: ['wss://relay.example'], comment: 'Thanks!', fetchImpl };
const event = { kind: 9734, content: 'Thanks!', tags: [['p', args.recipientPubkey], ['amount', '21000']] };
beforeEach(() => {
  vi.clearAllMocks();
  sdk.fetchLnurlPayMetadata.mockResolvedValue({ callback: 'https://example.com/pay', allowsNostr: true, minSendable: 1000, maxSendable: 100000, commentAllowed: 0 });
  sdk.buildZapRequest.mockResolvedValue({ event });
  fetchImpl.mockResolvedValue(new Response(JSON.stringify({ pr: 'lnbc1invoice' })));
});
describe('LNURL zap invoice', () => {
  it.each([400, 200])('preserves provider error reasons on HTTP %s', async (status) => {
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({ status: 'ERROR', reason: 'Amount rejected' }), { status }));
    await expect(requestZapInvoice(signer, args)).rejects.toThrow('Amount rejected');
  });
  it('uses a translated status fallback for a non-JSON error', async () => {
    fetchImpl.mockResolvedValue(new Response('bad request', { status: 400 }));
    await expect(requestZapInvoice(signer, args)).rejects.toThrow('callbackFailed');
  });
  it.each([999, 100001])('rejects %s msats before signing or calling back', async (amountMsats) => {
    await expect(requestZapInvoice(signer, { ...args, amountMsats })).rejects.toThrow('amountRange');
    expect(sdk.buildZapRequest).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('omits forbidden comments and returns the invoice and signed request', async () => {
    await expect(requestZapInvoice(signer, args)).resolves.toEqual({ invoice: 'lnbc1invoice', zapRequest: event });
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.has('comment')).toBe(false);
    expect(JSON.parse(url.searchParams.get('nostr')!)).toEqual(event);
    expect(url.searchParams.get('amount')).toBe('21000');
  });
  it('truncates only the callback comment', async () => {
    sdk.fetchLnurlPayMetadata.mockResolvedValue({ callback: 'https://example.com/pay', allowsNostr: true, minSendable: 1000, maxSendable: 100000, commentAllowed: 5 });
    await requestZapInvoice(signer, args);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('comment')).toBe('Thank');
    expect(sdk.buildZapRequest).toHaveBeenCalledWith(signer, args);
  });
  it('rejects a missing invoice', async () => {
    fetchImpl.mockResolvedValue(new Response('{}'));
    await expect(requestZapInvoice(signer, args)).rejects.toThrow('noInvoice');
  });
});
