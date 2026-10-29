import { describe, expect, it } from 'vitest';
import {
  inviteAllowance,
  inviteCreateRequest,
  inviteFormLimits,
  inviteMeFromJson,
  inviteRelayChoices,
  showsInviteEntry,
  splitInviteCodes,
} from '@/utils/relay/relay-invite-panel';
import type { RelayInviteCode } from '@/types/relay/relay-invite';

const base = { pubkey: 'pk', admitted: true, can_mint: true, is_admin: false, admits_used: 0, codes: [] };

describe('relay invite panel utils', () => {
  it('reads basis, the allowance and who invited, and falls back for an older relay', () => {
    const me = inviteMeFromJson({ ...base, basis: 'reference', admits_total: 10, admits_used: 3, admits_left: 7, invited_by: { code: 'c', pubkey: 'p', npub: 'n', at: 5 } });
    expect(me).toMatchObject({ basis: 'reference', admits_total: 10, admits_left: 7, invited_by: { pubkey: 'p', at: 5 } });
    expect(inviteMeFromJson({ ...base, basis: null, can_mint: false }).basis).toBeNull();
    expect(inviteMeFromJson({ ...base, is_admin: true }).basis).toBe('admin');
    expect(inviteMeFromJson({ ...base, can_mint: false }).basis).toBeNull();
    expect(inviteMeFromJson({ ...base, basis: 'nonsense', grant: { max_total_admits: 25 } })).toMatchObject({ basis: 'grant', admits_total: 25 });
    expect(inviteMeFromJson(null)).toMatchObject({ basis: null, codes: [], invited_by: null });
  });

  it('shows the entry while the account may invite or has links, even with nothing left', () => {
    expect(showsInviteEntry(null)).toBe(false);
    expect(showsInviteEntry(inviteMeFromJson({ ...base, basis: 'admin', can_mint: false, admits_left: 0 }))).toBe(true);
    expect(showsInviteEntry(inviteMeFromJson({ ...base, basis: null, can_mint: false, codes: [{ code: 'c' }] }))).toBe(true);
    expect(showsInviteEntry(inviteMeFromJson({ ...base, basis: null, can_mint: false }))).toBe(false);
  });

  it('lists the relay in view first, then the rest, each once', () => {
    expect(inviteRelayChoices('wss://b', ['wss://a', 'wss://b/', 'WSS://C'])).toEqual(['wss://b', 'wss://a', 'WSS://C']);
  });

  it('puts live links first and the rest under past links', () => {
    const codes = ['active', 'expired', 'active', 'revoked'].map((status, i) => ({ code: `${i}`, status })) as RelayInviteCode[];
    const { active, past } = splitInviteCodes(codes);
    expect(active.map((c) => c.code)).toEqual(['0', '2']);
    expect(past.map((c) => c.code)).toEqual(['1', '3']);
  });

  it('measures what is left of the allowance', () => {
    expect(inviteAllowance(inviteMeFromJson({ ...base, basis: 'owner', admits_total: 10, admits_used: 3, admits_left: 7 }))).toEqual({ left: 7, total: 10, percentLeft: 70 });
    expect(inviteAllowance(inviteMeFromJson({ ...base, basis: 'admin', is_admin: true }))).toBeNull();
  });

  it('limits a new link to what is left and to the allowance\'s longest lifetime', () => {
    expect(inviteFormLimits(inviteMeFromJson({ ...base, basis: 'owner', admits_total: 10, admits_left: 4 }))).toEqual({ maxPeople: 4, maxDays: 30, defaultDays: 7 });
    expect(inviteFormLimits(inviteMeFromJson({ ...base, basis: 'grant', admits_left: 20, grant: { max_uses_per_code: 5, max_ttl_secs: 3 * 86_400 } }))).toEqual({ maxPeople: 5, maxDays: 3, defaultDays: 3 });
  });

  it('turns the form into a request, or names the field that is wrong', () => {
    const limits = { maxPeople: 4, maxDays: 30, defaultDays: 7 };
    expect(inviteCreateRequest({ label: ' meetup ', people: '3', days: '2' }, limits)).toEqual({ ok: true, options: { label: 'meetup', maxUses: 3, expiresInSecs: 2 * 86_400 } });
    expect(inviteCreateRequest({ label: '', people: '4', days: '7' }, limits)).toEqual({ ok: true, options: { maxUses: 4, expiresInSecs: 7 * 86_400 } });
    expect(inviteCreateRequest({ label: '', people: '5', days: '7' }, limits)).toEqual({ ok: false, problem: 'people' });
    expect(inviteCreateRequest({ label: '', people: '0', days: '7' }, limits)).toEqual({ ok: false, problem: 'people' });
    expect(inviteCreateRequest({ label: '', people: '2', days: '31' }, limits)).toEqual({ ok: false, problem: 'days' });
    expect(inviteCreateRequest({ label: 'x'.repeat(81), people: '2', days: '3' }, limits)).toEqual({ ok: false, problem: 'label' });
  });
});
