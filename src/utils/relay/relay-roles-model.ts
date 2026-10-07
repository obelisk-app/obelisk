/**
 * Relay roles: the data model. Types, normalisation, the tag codec for the
 * catalog and holders events, and the pure lookups the UI uses. No I/O here;
 * `relay-roles-sync.ts` talks to relays and `relay-roles.ts` is the entry point.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import {
  DEFAULT_ROLE_COLOR,
  MAX_ROLES,
  ROLE_ID_RE,
  MAX_ROLE_EMOJI_LENGTH,
} from '@/constants/relay/relay-roles-model';

export interface RelayRole {
  /** Stable slug used in the holders d-tag. */
  readonly id: string;
  readonly name: string;
  /** Higher is more senior. Only the highest-tier held role is shown. */
  readonly tier: number;
  /** Badge color, `#rgb` or `#rrggbb`. */
  readonly color: string;
  /** Optional glyph shown before the name on the badge. */
  readonly emoji: string;
}

export interface RelayRoles {
  /** Catalog, ordered most senior first. */
  readonly roles: readonly RelayRole[];
  /** roleId -> pubkeys holding it. */
  readonly holders: Readonly<Record<string, readonly string[]>>;
  /** created_at of the catalog event, or 0 if none seen yet. */
  readonly updatedAt: number;
}

export const EMPTY_RELAY_ROLES: RelayRoles = { roles: [], holders: {}, updatedAt: 0 };

const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const PUBKEY_RE = /^[0-9a-f]{64}$/i;

export function normalizeRoleEmoji(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, '').slice(0, MAX_ROLE_EMOJI_LENGTH);
}

export function normalizeRoleId(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 32);
}

/**
 * Always returns a 6-digit hex so the badge can append an alpha pair
 * (`#rrggbb` + `1f`) for its tint without special-casing shorthand.
 */
export function normalizeRoleColor(value: string | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!COLOR_RE.test(trimmed)) return DEFAULT_ROLE_COLOR;
  return trimmed.length === 4
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
}

/** Most senior first; id breaks ties so every client agrees on the badge. */
export function sortRoles(roles: ReadonlyArray<RelayRole>): RelayRole[] {
  return [...roles].sort((a, b) => (b.tier - a.tier) || a.id.localeCompare(b.id));
}

export function roleCatalogDTag(relayUrl: string): string {
  return `obelisk:roles:${relayUrl}`;
}

export function roleHoldersDTag(relayUrl: string, roleId: string): string {
  return `obelisk:role:${relayUrl}:${roleId}`;
}

function roleFromTag(tag: ReadonlyArray<string>): RelayRole | null {
  const id = normalizeRoleId(tag[1] ?? '');
  if (!ROLE_ID_RE.test(id)) return null;
  const name = (tag[2] ?? '').trim().slice(0, 32) || id;
  const tier = Number.parseInt(tag[3] ?? '', 10);
  return {
    id,
    name,
    tier: Number.isFinite(tier) ? Math.min(999, Math.max(0, tier)) : 0,
    color: normalizeRoleColor(tag[4]),
    emoji: normalizeRoleEmoji(tag[5]),
  };
}

export function parseRoleCatalog(ev: NostrEvent): RelayRoles {
  const byId = new Map<string, RelayRole>();
  for (const tag of ev.tags) {
    if (tag[0] !== 'role') continue;
    const role = roleFromTag(tag);
    // First tag wins: a duplicate id would otherwise make the badge depend on
    // tag order, and the writer already de-duplicates.
    if (role && !byId.has(role.id)) byId.set(role.id, role);
  }
  return {
    roles: sortRoles(Array.from(byId.values())).slice(0, MAX_ROLES),
    holders: {},
    updatedAt: ev.created_at,
  };
}

export function toRoleCatalogTags(roles: ReadonlyArray<RelayRole>, relayUrl: string): string[][] {
  const tags: string[][] = [['d', roleCatalogDTag(relayUrl)]];
  const seen = new Set<string>();
  for (const role of sortRoles(roles)) {
    const id = normalizeRoleId(role.id);
    if (!ROLE_ID_RE.test(id) || seen.has(id) || seen.size >= MAX_ROLES) continue;
    seen.add(id);
    const tag = ['role', id, role.name.trim().slice(0, 32) || id, String(role.tier), normalizeRoleColor(role.color)];
    const emoji = normalizeRoleEmoji(role.emoji);
    // Positional tag: only append the glyph when there is one, so older
    // readers that stop at the color keep parsing cleanly.
    if (emoji) tag.push(emoji);
    tags.push(tag);
  }
  return tags;
}

export interface RoleHolders {
  readonly roleId: string;
  readonly pubkeys: readonly string[];
  readonly updatedAt: number;
}

/**
 * Reads a holders event. `relayUrl` is required because the role id is only
 * trustworthy when the event's `d` tag is the one we asked for - otherwise a
 * holders list published for relay A could claim to grant roles on relay B.
 */
export function parseRoleHolders(ev: NostrEvent, relayUrl: string): RoleHolders | null {
  const d = ev.tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
  const prefix = `obelisk:role:${relayUrl}:`;
  if (!d.startsWith(prefix)) return null;
  const roleId = normalizeRoleId(d.slice(prefix.length));
  if (!ROLE_ID_RE.test(roleId)) return null;
  const pubkeys: string[] = [];
  const seen = new Set<string>();
  for (const tag of ev.tags) {
    if (tag[0] !== 'p') continue;
    const pubkey = (tag[1] ?? '').trim().toLowerCase();
    if (!PUBKEY_RE.test(pubkey) || seen.has(pubkey)) continue;
    seen.add(pubkey);
    pubkeys.push(pubkey);
  }
  return { roleId, pubkeys, updatedAt: ev.created_at };
}

export function toRoleHoldersTags(
  relayUrl: string,
  roleId: string,
  pubkeys: ReadonlyArray<string>,
): string[][] {
  const id = normalizeRoleId(roleId);
  const tags: string[][] = [['d', roleHoldersDTag(relayUrl, id)], ['role', id]];
  const seen = new Set<string>();
  for (const raw of pubkeys) {
    const pubkey = raw.trim().toLowerCase();
    if (!PUBKEY_RE.test(pubkey) || seen.has(pubkey)) continue;
    seen.add(pubkey);
    tags.push(['p', pubkey]);
  }
  return tags;
}

// -- Pure helpers used by the UI ---------------------------------------------

/** Every role the pubkey holds, most senior first. */
export function rolesForPubkey(state: RelayRoles, pubkey: string): RelayRole[] {
  if (!pubkey) return [];
  return state.roles.filter((role) => state.holders[role.id]?.includes(pubkey));
}

/** The single role that shows next to the name - highest tier held. */
export function topRole(state: RelayRoles, pubkey: string): RelayRole | null {
  return rolesForPubkey(state, pubkey)[0] ?? null;
}

/** Fan the holder lists out into the per-pubkey map the chat store keeps. */
export function rolesByPubkey(state: RelayRoles): Record<string, RelayRole[]> {
  const out: Record<string, RelayRole[]> = {};
  for (const role of state.roles) {
    for (const pubkey of state.holders[role.id] ?? []) {
      (out[pubkey] ??= []).push(role);
    }
  }
  // `state.roles` is already sorted, so each list comes out most-senior-first.
  return out;
}

/** What Save would publish, as a comparable string: id, name, tier, color, emoji per role. */
export function serializeRoles(list: ReadonlyArray<RelayRole>): string {
  return JSON.stringify(list.map((role) => [role.id, role.name, role.tier, role.color, role.emoji]));
}

/** Tiers are dense and descending by list position: top row is most senior. */
export function retier(roles: ReadonlyArray<RelayRole>): RelayRole[] {
  return roles.map((role, index) => ({ ...role, tier: roles.length - index }));
}
