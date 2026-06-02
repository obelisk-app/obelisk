import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parseZapCommand } from './parse-zap-command';

// The parser pulls metadata and member rosters off the live bridge. The
// suite mocks `getBridgeImpl` so each case can dial in exactly the slice
// of state it cares about (member list + kind:0 metadata) without touching
// the real SimplePool or NDK.
const bridgeState = {
  metadata: {} as Record<string, { name?: string | null; displayName?: string | null }>,
  members: [] as string[],
};

vi.mock('@/lib/nostr-bridge', () => ({
  getBridgeImpl: () => ({
    userMetadata: { get: () => bridgeState.metadata },
    membersByGroup: { get: () => ({ 'group-1': bridgeState.members }) },
  }),
}));

const RECIPIENT_HEX = 'a'.repeat(64);
const RECIPIENT_NPUB = nip19.npubEncode(RECIPIENT_HEX);
const MY_PUBKEY = 'b'.repeat(64);

beforeEach(() => {
  bridgeState.metadata = {
    [RECIPIENT_HEX]: { name: 'dum', displayName: 'Dum' },
  };
  bridgeState.members = [RECIPIENT_HEX];
});

afterEach(() => {
  bridgeState.metadata = {};
  bridgeState.members = [];
});

describe('parseZapCommand', () => {
  it('resolves a clean `/zap nostr:npub… 1` form (post-fix happy path)', () => {
    const r = parseZapCommand(
      `/zap nostr:${RECIPIENT_NPUB} 1`,
      'group-1',
      [],
      MY_PUBKEY,
      null,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.target.recipientPubkey).toBe(RECIPIENT_HEX);
    expect(r.target.defaultAmountSats).toBe(1);
  });

  it('still resolves when a stray display name precedes the npub', () => {
    // Regression: before the fix, the desktop mention picker would leave a
    // partial display name in front of the npub (e.g. `/zap dum nostr:npub…
    // 1`). The parser now picks the npub from anywhere in the args instead
    // of failing with "Unknown user".
    const r = parseZapCommand(
      `/zap dum nostr:${RECIPIENT_NPUB} 1`,
      'group-1',
      [],
      MY_PUBKEY,
      null,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.target.recipientPubkey).toBe(RECIPIENT_HEX);
    expect(r.target.defaultAmountSats).toBe(1);
  });

  it('resolves a bare display-name token by channel-member lookup', () => {
    const r = parseZapCommand('/zap dum 21', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.target.recipientPubkey).toBe(RECIPIENT_HEX);
    expect(r.target.defaultAmountSats).toBe(21);
  });

  it('resolves an `@name` token by stripping the leading `@`', () => {
    const r = parseZapCommand('/zap @dum', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.target.recipientPubkey).toBe(RECIPIENT_HEX);
  });

  it('falls back to the last message author when no user token is given', () => {
    const r = parseZapCommand(
      '/zap 5',
      'group-1',
      [
        { id: 'm1', pubkey: MY_PUBKEY },
        { id: 'm2', pubkey: RECIPIENT_HEX },
      ],
      MY_PUBKEY,
      null,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.target.recipientPubkey).toBe(RECIPIENT_HEX);
    expect(r.target.messageId).toBe('m2');
    expect(r.target.defaultAmountSats).toBe(5);
  });

  it('refuses to zap yourself', () => {
    const r = parseZapCommand(
      `/zap nostr:${RECIPIENT_NPUB}`,
      'group-1',
      [],
      RECIPIENT_HEX, // myPubkey === recipient
      null,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/cannot zap yourself/i);
  });

  it('returns "Unknown user" only when nothing in args resolves', () => {
    const r = parseZapCommand('/zap nobody', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unknown user/i);
  });
});
