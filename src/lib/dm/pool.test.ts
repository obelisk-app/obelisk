import { describe, it, expect } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { verifyDMEvent } from './pool';

describe('verifyDMEvent', () => {
  function signed(content: string) {
    const sk = generateSecretKey();
    const ev = finalizeEvent({
      kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content,
    }, sk);
    return { ev, pubkey: getPublicKey(sk) };
  }

  it('accepts a valid signed event', () => {
    const { ev } = signed('hello');
    expect(verifyDMEvent(ev)).toBe(true);
  });

  it('rejects an event with a sig from a different message', () => {
    const a = signed('hello');
    const b = signed('world');
    const tampered = { ...a.ev, sig: b.ev.sig };
    expect(verifyDMEvent(tampered)).toBe(false);
  });

  it('rejects an event whose pubkey does not match the sig', () => {
    const a = signed('hello');
    const b = signed('also hello');
    const tampered = { ...a.ev, pubkey: b.ev.pubkey };
    expect(verifyDMEvent(tampered)).toBe(false);
  });

  it('rejects when content is mutated post-sign', () => {
    const { ev } = signed('hello');
    const tampered = { ...ev, content: 'goodbye' };
    expect(verifyDMEvent(tampered)).toBe(false);
  });
});
