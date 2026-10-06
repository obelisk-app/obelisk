import { describe, expect, it } from 'vitest';
import { getPublicKey } from 'nostr-tools/pure';
import { hexToNpub } from '@nostr-wot/data';
import { safeNpub, shortNpubLabel } from '@/utils/identity/short-npub';

const PUBKEY = getPublicKey(new Uint8Array(32).fill(3));

describe('shortNpubLabel', () => {
  it('shows npub1 plus five, an ellipsis and the last four; nothing for a non-key', () => {
    expect(shortNpubLabel(PUBKEY)).toMatch(/^npub1.{5}\u2026.{4}$/);
    expect(shortNpubLabel('not-hex')).toBe('');
  });
});

describe('safeNpub', () => {
  it('encodes a hex pubkey and passes anything else through', () => {
    expect(safeNpub(PUBKEY)).toBe(hexToNpub(PUBKEY));
    expect(safeNpub('not-hex')).toBe('not-hex');
  });
});
