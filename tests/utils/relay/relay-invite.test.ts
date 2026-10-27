import { describe, expect, it } from 'vitest';
import {
  cleanInviteCode,
  inviteLinkRelay,
  inviteNeedsRedeem,
  inviteUsage,
  isDeadInviteReason,
  relayHttpOrigin,
  relayInviteApiUrl,
  relayInviteClaimTemplate,
  relayInviteLink,
  relayInviteRefusalReason,
} from '@/utils/relay/relay-invite';
import { KIND_RELAY_INVITE_CLAIM } from '@/constants/nostr/nip-kinds';
import { DEFAULT_RELAY } from '@/constants/nostr-bridge/relay';

describe('relay invite utils', () => {
  it('accepts a real code and refuses anything that cannot be one', () => {
    expect(cleanInviteCode(' Xk3abcDEF0123456789z ')).toBe('Xk3abcDEF0123456789z');
    expect(cleanInviteCode('')).toBeNull();
    expect(cleanInviteCode(undefined)).toBeNull();
    expect(cleanInviteCode('has space')).toBeNull();
    expect(cleanInviteCode('<script>')).toBeNull();
    expect(cleanInviteCode('x'.repeat(65))).toBeNull();
  });

  it('builds a NIP-43 claim carrying only the code', () => {
    expect(relayInviteClaimTemplate('abc', 42)).toEqual({
      kind: KIND_RELAY_INVITE_CLAIM, created_at: 42, content: '', tags: [['claim', 'abc']],
    });
  });

  it('reads the reason word of an invite refusal and nothing else', () => {
    expect(relayInviteRefusalReason('restricted: invite exhausted: this code has no uses left')).toBe('exhausted');
    expect(relayInviteRefusalReason('restricted: invite stale: too far')).toBe('stale');
    expect(relayInviteRefusalReason('restricted: Access denied')).toBeNull();
    expect(relayInviteRefusalReason(null)).toBeNull();
    expect(isDeadInviteReason('exhausted')).toBe(true);
    expect(isDeadInviteReason('inactive')).toBe(true);
    expect(isDeadInviteReason('stale')).toBe(false);
    expect(isDeadInviteReason(null)).toBe(false);
  });

  it('turns the relay into the HTTP origin of its minter API', () => {
    expect(relayHttpOrigin('wss://public.obelisk.ar/')).toBe('https://public.obelisk.ar');
    expect(relayHttpOrigin('public.obelisk.ar')).toBe('https://public.obelisk.ar');
    expect(relayInviteApiUrl('wss://public.obelisk.ar', '/me')).toBe('https://public.obelisk.ar/api/invites/me');
    expect(relayInviteApiUrl('wss://public.obelisk.ar')).toBe('https://public.obelisk.ar/api/invites');
  });

  it('shares a link to this app with the code and relay host', () => {
    expect(relayInviteLink('https://obelisk.ar/', 'abc', 'public.obelisk.ar'))
      .toBe('https://obelisk.ar/invite/abc?relay=public.obelisk.ar');
  });

  it('defaults the link relay and normalizes it', () => {
    expect(inviteLinkRelay(undefined)).toBe(DEFAULT_RELAY);
    expect(inviteLinkRelay('Public.Obelisk.AR')).toBe('wss://public.obelisk.ar');
    expect(inviteLinkRelay(['wss://a.example', 'wss://b.example'])).toBe('wss://a.example');
  });

  it('needs a redeem only for a new key on the invite relay', () => {
    const invite = { code: 'c', relay: 'wss://public.obelisk.ar', redeemed: ['old'] };
    expect(inviteNeedsRedeem(invite, 'wss://public.obelisk.ar/', 'new')).toBe(true);
    expect(inviteNeedsRedeem(invite, 'wss://public.obelisk.ar', 'old')).toBe(false);
    expect(inviteNeedsRedeem(invite, 'wss://other.example', 'new')).toBe(false);
    expect(inviteNeedsRedeem(null, 'wss://public.obelisk.ar', 'new')).toBe(false);
  });

  it('measures a code for its card', () => {
    const now = 1_000_000_000_000;
    const u = inviteUsage({ uses: 3, max_uses: 10, expires_at: now / 1000 + 86_400 * 2.5, redemptions: [{ pubkey: 'a', at: 1 }, { pubkey: 'b', at: 5 }] }, now);
    expect(u.usedPercent).toBe(30);
    expect(u.daysLeft).toBe(3);
    expect(u.joined.map((p) => p.pubkey)).toEqual(['b', 'a']);
    expect(inviteUsage({ uses: 3, max_uses: null, expires_at: null, redemptions: [] }, now)).toEqual({ usedPercent: null, daysLeft: null, joined: [] });
  });
});
