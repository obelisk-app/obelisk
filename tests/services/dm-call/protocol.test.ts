import { describe, expect, it } from 'vitest';
import { encodeDmCallMessage, isFreshCallMessage, newCallId, parseDmCallMessage } from '@/services/dm-call/protocol';

const id = 'a'.repeat(64);
const eph = 'b'.repeat(64);

describe('dm-call protocol', () => {
  it('round-trips an invite', () => {
    const msg = { type: 'invite' as const, callId: id, eph, relays: ['wss://r1.example', 'wss://r2.example'], video: true };
    expect(parseDmCallMessage(encodeDmCallMessage(msg))).toEqual(msg);
  });

  it('rejects malformed messages', () => {
    expect(parseDmCallMessage('nope')).toBeNull();
    expect(parseDmCallMessage(JSON.stringify({ type: 'dial', callId: id }))).toBeNull();
    expect(parseDmCallMessage(JSON.stringify({ type: 'hangup', callId: 'short' }))).toBeNull();
    // invite / accept need a throwaway key
    expect(parseDmCallMessage(JSON.stringify({ type: 'accept', callId: id }))).toBeNull();
    // an invite with no usable relay is useless
    expect(parseDmCallMessage(JSON.stringify({ type: 'invite', callId: id, eph, relays: ['https://x', 'javascript:1'] }))).toBeNull();
  });

  it('keeps only ws(s) relays, deduped and capped', () => {
    const parsed = parseDmCallMessage(JSON.stringify({
      type: 'invite', callId: id, eph,
      relays: ['wss://a.example', 'wss://a.example', 'wss://u:p@b.example', 'https://c.example', 'wss://d.example', 'wss://e.example', 'wss://f.example', 'wss://g.example'],
    }));
    expect(parsed?.relays).toEqual(['wss://a.example', 'wss://d.example', 'wss://e.example', 'wss://f.example']);
  });

  it('accepts only fresh messages', () => {
    const now = 1_000_000_000_000;
    expect(isFreshCallMessage(now / 1000 - 10, now)).toBe(true);
    expect(isFreshCallMessage(now / 1000 - 120, now)).toBe(false);
    expect(isFreshCallMessage(now / 1000 + 600, now)).toBe(false);
  });

  it('mints 32-byte hex call ids', () => {
    const a = newCallId();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(newCallId()).not.toBe(a);
  });
});
