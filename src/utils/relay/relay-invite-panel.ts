/**
 * Pure shaping for Settings > Invite people: reading the relay's `/me`
 * answer, which relays the picker offers, the allowance meter, the create
 * form's limits and the split between live and past links.
 */
import {
  RELAY_INVITE_AUTO_ALLOWANCE,
  RELAY_INVITE_AUTO_MAX_TTL_SECS,
  RELAY_INVITE_DEFAULT_DAYS,
  RELAY_INVITE_LABEL_MAX,
} from '@/constants/relay/relay-invite';
import type {
  RelayInviteBasis,
  RelayInviteCode,
  RelayInviteCreateOptions,
  RelayInviteGrant,
  RelayInviteInvitedBy,
  RelayInviteMe,
} from '@/types/relay/relay-invite';
import { normalizeDeepLinkRelay } from './deep-link';

const BASES: ReadonlyArray<RelayInviteBasis> = ['owner', 'admin', 'reference', 'grant'];

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function grantFrom(raw: unknown): RelayInviteGrant | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Json;
  return {
    max_codes: num(g.max_codes),
    max_uses_per_code: num(g.max_uses_per_code),
    max_total_admits: num(g.max_total_admits),
    max_ttl_secs: num(g.max_ttl_secs),
  };
}

function invitedByFrom(raw: unknown): RelayInviteInvitedBy | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Json;
  const pubkey = str(b.pubkey);
  if (!pubkey) return null;
  return { code: str(b.code) ?? '', pubkey, npub: str(b.npub) ?? '', at: num(b.at) ?? 0 };
}

/**
 * The relay's `/me` answer, normalized. A relay from before `basis` existed
 * still reads sensibly: an admin is `admin`, anyone else allowed to mint (a
 * grant holder) `grant`.
 */
export function inviteMeFromJson(raw: unknown): RelayInviteMe {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const grant = grantFrom(m.grant);
  const isAdmin = m.is_admin === true;
  const basis = BASES.includes(m.basis as RelayInviteBasis)
    ? (m.basis as RelayInviteBasis)
    : m.basis === null ? null : isAdmin ? 'admin' : grant || m.can_mint === true ? 'grant' : null;
  const used = num(m.admits_used) ?? 0;
  const left = num(m.admits_left);
  return {
    pubkey: str(m.pubkey) ?? '',
    admitted: m.admitted === true,
    basis,
    can_mint: m.can_mint === true,
    is_admin: isAdmin,
    admits_total: num(m.admits_total) ?? grant?.max_total_admits ?? (left != null ? left + used : null),
    admits_used: used,
    admits_left: left,
    codes_left: num(m.codes_left),
    invited_by: invitedByFrom(m.invited_by),
    grant,
    codes: Array.isArray(m.codes) ? (m.codes as RelayInviteCode[]) : [],
  };
}

/**
 * Whether Settings shows "Invite people" for this answer: the account may
 * invite on the relay, or it made links there (spent allowance or not, the
 * person still wants to see who joined).
 */
export function showsInviteEntry(me: RelayInviteMe | null | undefined): boolean {
  return !!me && (me.basis !== null || me.codes.length > 0);
}

/** The picker's relays: the one in view first, then the rest of the person's list, each once. */
export function inviteRelayChoices(current: string | null | undefined, configured: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [current, ...configured]) {
    if (!url) continue;
    const key = normalizeDeepLinkRelay(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/** Live links first; the rest (expired, used up, turned off) under "Past links". */
export function splitInviteCodes(codes: ReadonlyArray<RelayInviteCode>): { active: RelayInviteCode[]; past: RelayInviteCode[] } {
  return {
    active: codes.filter((c) => c.status === 'active'),
    past: codes.filter((c) => c.status !== 'active'),
  };
}

/** The allowance as the meter shows it ("7 of 10 left"), or null when there is no limit to show. */
export function inviteAllowance(me: RelayInviteMe): { left: number; total: number; percentLeft: number } | null {
  if (me.admits_total == null) return null;
  const total = me.admits_total;
  const left = Math.max(0, Math.min(total, me.admits_left ?? total - me.admits_used));
  return { left, total, percentLeft: total > 0 ? Math.round((left / total) * 100) : 0 };
}

export interface InviteFormLimits {
  /** Most people one new link may admit (1 when nothing is left; the form is off then). */
  maxPeople: number;
  maxDays: number;
  defaultDays: number;
}

/** What the create form allows: people up to what is left of the allowance, days up to the grant's (or 30). */
export function inviteFormLimits(me: RelayInviteMe): InviteFormLimits {
  const perCode = me.grant?.max_uses_per_code ?? (me.basis === 'grant' ? null : RELAY_INVITE_AUTO_ALLOWANCE);
  const caps = [me.admits_left, perCode].filter((n): n is number => n != null && n > 0);
  const maxPeople = Math.max(1, caps.length ? Math.min(...caps) : RELAY_INVITE_AUTO_ALLOWANCE);
  const ttl = me.grant?.max_ttl_secs ?? RELAY_INVITE_AUTO_MAX_TTL_SECS;
  const maxDays = Math.max(1, Math.floor(ttl / 86_400));
  return { maxPeople, maxDays, defaultDays: Math.min(RELAY_INVITE_DEFAULT_DAYS, maxDays) };
}

export type InviteFormValues = { label: string; people: string; days: string };

function wholeIn(value: string, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n >= 1 && n <= max ? n : null;
}

/**
 * The create form's values as the request, or which field is wrong:
 * `label` too long, `people` outside 1..maxPeople, `days` outside 1..maxDays.
 */
export function inviteCreateRequest(
  values: InviteFormValues,
  limits: InviteFormLimits,
): { ok: true; options: RelayInviteCreateOptions } | { ok: false; problem: 'label' | 'people' | 'days' } {
  const label = values.label.trim();
  if (label.length > RELAY_INVITE_LABEL_MAX) return { ok: false, problem: 'label' };
  const people = wholeIn(values.people, limits.maxPeople);
  if (people == null) return { ok: false, problem: 'people' };
  const days = wholeIn(values.days, limits.maxDays);
  if (days == null) return { ok: false, problem: 'days' };
  return { ok: true, options: { ...(label ? { label } : {}), maxUses: people, expiresInSecs: days * 86_400 } };
}
