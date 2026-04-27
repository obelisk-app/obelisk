import { describe, it, expect } from 'vitest';
import { validateZapReceipt, type RawNostrEvent } from './zap-receipt';

const RECIPIENT = 'recipient_pub';
const SENDER = 'sender_pub';
const PROVIDER = 'provider_nostr_pub';

function makeReceipt(overrides: Partial<{
  kind: number;
  recipient: string;
  sender: string;
  amount: string;
  bolt11: string;
  messageId?: string;
  providerPubkey: string;
  zapRequestPubkey: string;
  zapRequestKind: number;
}> = {}): RawNostrEvent {
  const opts = {
    kind: 9735,
    recipient: RECIPIENT,
    sender: SENDER,
    amount: '21000',
    bolt11: 'lnbc100u...',
    providerPubkey: PROVIDER,
    zapRequestPubkey: SENDER,
    zapRequestKind: 9734,
    ...overrides,
  };
  const zapReq = {
    kind: opts.zapRequestKind,
    pubkey: opts.zapRequestPubkey,
    tags: [['p', opts.recipient], ['amount', opts.amount]],
    content: '',
    id: 'zr_id',
    sig: 'zr_sig',
    created_at: 1,
  };
  if (opts.messageId) zapReq.tags.push(['e', opts.messageId]);
  const tags: string[][] = [
    ['p', opts.recipient],
    ['P', opts.sender],
    ['bolt11', opts.bolt11],
    ['description', JSON.stringify(zapReq)],
    ['preimage', 'pi_hex'],
  ];
  if (opts.messageId) tags.push(['e', opts.messageId]);
  return {
    kind: opts.kind,
    pubkey: opts.providerPubkey,
    tags,
    content: '',
    id: 'recpt_id',
    sig: 'recpt_sig',
    created_at: 1,
  };
}

describe('validateZapReceipt', () => {
  it('returns valid result for a well-formed receipt', () => {
    const r = validateZapReceipt(makeReceipt(), RECIPIENT);
    expect(r).not.toBeNull();
    expect(r?.senderPubkey).toBe(SENDER);
    expect(r?.amountMsat).toBe(21000);
    expect(r?.bolt11).toBe('lnbc100u...');
  });

  it('extracts messageId from receipt e tag', () => {
    const r = validateZapReceipt(makeReceipt({ messageId: 'm1' }), RECIPIENT);
    expect(r?.messageId).toBe('m1');
  });

  it('rejects wrong kind', () => {
    expect(validateZapReceipt(makeReceipt({ kind: 1 }), RECIPIENT)).toBeNull();
  });

  it('rejects when p tag does not match expectedRecipient', () => {
    expect(validateZapReceipt(makeReceipt({ recipient: 'other' }), RECIPIENT)).toBeNull();
  });

  it('rejects when bolt11 tag is missing', () => {
    const ev = makeReceipt();
    ev.tags = ev.tags.filter((t) => t[0] !== 'bolt11');
    expect(validateZapReceipt(ev, RECIPIENT)).toBeNull();
  });

  it('rejects when description is not valid JSON', () => {
    const ev = makeReceipt();
    const i = ev.tags.findIndex((t) => t[0] === 'description');
    ev.tags[i] = ['description', 'not-json'];
    expect(validateZapReceipt(ev, RECIPIENT)).toBeNull();
  });

  it('rejects when embedded zap-request has wrong kind', () => {
    expect(validateZapReceipt(makeReceipt({ zapRequestKind: 1 }), RECIPIENT)).toBeNull();
  });

  it('rejects when embedded zap-request p tag does not match recipient', () => {
    const ev = makeReceipt();
    const dIdx = ev.tags.findIndex((t) => t[0] === 'description');
    const zr = JSON.parse(ev.tags[dIdx][1]);
    zr.tags = zr.tags.filter((t: string[]) => t[0] !== 'p');
    zr.tags.push(['p', 'someone_else']);
    ev.tags[dIdx] = ['description', JSON.stringify(zr)];
    expect(validateZapReceipt(ev, RECIPIENT)).toBeNull();
  });

  it('rejects non-positive amount', () => {
    expect(validateZapReceipt(makeReceipt({ amount: '0' }), RECIPIENT)).toBeNull();
    expect(validateZapReceipt(makeReceipt({ amount: 'abc' }), RECIPIENT)).toBeNull();
  });

  it('with trustedProviderPubkeys provided: accepts trusted signer', () => {
    const r = validateZapReceipt(makeReceipt(), RECIPIENT, new Set([PROVIDER]));
    expect(r).not.toBeNull();
  });

  it('with trustedProviderPubkeys provided: rejects untrusted signer', () => {
    const r = validateZapReceipt(makeReceipt(), RECIPIENT, new Set(['other']));
    expect(r).toBeNull();
  });

  it('without trustedProviderPubkeys: accepts any signer', () => {
    const r = validateZapReceipt(makeReceipt({ providerPubkey: 'anyone' }), RECIPIENT);
    expect(r).not.toBeNull();
  });
});
