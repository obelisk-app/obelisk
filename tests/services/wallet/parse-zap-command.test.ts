import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parseZapCommand } from '@/services/wallet/parse-zap-command';

// The parser pulls metadata and member rosters off the live bridge. The
// suite mocks `getBridgeImpl` so each case can dial in exactly the slice
// of state it cares about (member list + kind:0 metadata) without touching
// the real SimplePool or NDK.
const bridgeState = {
  metadata: {} as Record<string, { name?: string | null; displayName?: string | null }>,
  members: [] as string[],
};

vi.mock('@/services/nostr-bridge', () => ({
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
    expect(r.error).toBe('self');
  });

  it('refuses a display name that fits more than one member', () => {
    // A name is not an identity: anyone can set theirs to "Dum". Paying the
    // first match the roster listed would hand the sats to whoever got there
    // first, so the command refuses and asks for an npub.
    const IMPOSTOR = 'c'.repeat(64);
    bridgeState.metadata[IMPOSTOR] = { name: 'dum2', displayName: 'Dum' };
    bridgeState.members = [IMPOSTOR, RECIPIENT_HEX];
    const r = parseZapCommand('/zap @dum 21', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('ambiguous');
    expect(r.token).toBe('@dum');
    // The npub form is unaffected: that IS the identity.
    const byKey = parseZapCommand(`/zap nostr:${RECIPIENT_NPUB} 21`, 'group-1', [], MY_PUBKEY, null);
    expect(byKey.ok).toBe(true);
    if (!byKey.ok) return;
    expect(byKey.target.recipientPubkey).toBe(RECIPIENT_HEX);
  });

  it('refuses a substring that fits more than one member', () => {
    const OTHER = 'd'.repeat(64);
    bridgeState.metadata[OTHER] = { name: 'dumbledore', displayName: null };
    bridgeState.metadata[RECIPIENT_HEX] = { name: 'dumas', displayName: null };
    bridgeState.members = [RECIPIENT_HEX, OTHER];
    const r = parseZapCommand('/zap dum', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(false);
  });

  it('returns "Unknown user" only when nothing in args resolves', () => {
    const r = parseZapCommand('/zap nobody', 'group-1', [], MY_PUBKEY, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('unknown-user');
    expect(r.token).toBe('nobody');
  });
});

describe('zap command payment intent', () => {
  const parse = (args: string) => parseZapCommand(`/zap ${args}`, 'group-1', [], MY_PUBKEY, null);
  it('opens the popup for a recipient alone', () => {
    expect(parse(RECIPIENT_NPUB)).toMatchObject({ ok: true, immediate: false, comment: '' });
  });
  it('pays a recipient and amount immediately with an optional message', () => {
    expect(parse(`${RECIPIENT_NPUB} 21`)).toMatchObject({ ok: true, immediate: true, comment: '', target: { defaultAmountSats: 21 } });
    expect(parse('@Dum 100 thanks for the 21 tips')).toMatchObject({ ok: true, immediate: true, comment: 'thanks for the 21 tips', target: { defaultAmountSats: 100 } });
  });
  it('rejects explicitly invalid amounts rather than substituting a default', () => {
    for (const amount of ['0', '-21', '1.5', '1e3', '21sats', 'Infinity', 'NaN', '9007199254740991']) {
      expect(parse(`${RECIPIENT_NPUB} ${amount}`)).toMatchObject({ ok: false, error: 'invalid' });
    }
  });
  it('does not mistake an all-digit hex public key for an amount', () => {
    expect(parse('1'.repeat(64))).toMatchObject({ ok: true, immediate: false, target: { recipientPubkey: '1'.repeat(64) } });
  });
});

it('preserves complete multiword display names that contain numbers', () => {
  bridgeState.metadata[RECIPIENT_HEX] = { displayName: 'Agent 47' };
  const parse = (args: string) => parseZapCommand(`/zap ${args}`, 'group-1', [], MY_PUBKEY, null);
  expect(parse('@Agent 47')).toMatchObject({ ok: true, immediate: false });
  expect(parse('@Agent 47 21 thanks')).toMatchObject({ ok: true, immediate: true, comment: 'thanks', target: { defaultAmountSats: 21 } });
});
