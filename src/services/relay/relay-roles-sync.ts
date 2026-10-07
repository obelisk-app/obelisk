/**
 * Relay roles: relay I/O. Subscribes to the operator-authored catalog and
 * holder events (stale-while-revalidate from the local cache) and publishes
 * them. The model and codec live in `relay-roles-model.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getBridge, getBridgeImpl, cacheGet, cacheSet } from '@/services/nostr-bridge';
import { KIND_NIP78_APP_DATA as KIND_ROLES } from '@/constants/nostr/nip-kinds';
import {
  EMPTY_RELAY_ROLES,
  normalizeRoleId,
  parseRoleCatalog,
  parseRoleHolders,
  roleCatalogDTag,
  roleHoldersDTag,
  sortRoles,
  toRoleCatalogTags,
  toRoleHoldersTags,
  type RelayRole,
  type RelayRoles,
  type RoleHolders,
} from '@/utils/relay/relay-roles-model';
import { ROLE_ID_RE } from '@/constants/relay/relay-roles-model';

interface CachedCatalog {
  readonly roles: readonly RelayRole[];
  readonly updatedAt: number;
}

/** Last created_at we published per d-tag, so a same-second edit still wins. */
const publishedAt = new Map<string, number>();

export function subscribeRelayRoles(
  relayUrl: string,
  authors: ReadonlyArray<string>,
  onChange: (roles: RelayRoles) => void,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    void getBridge().then(() => {
      if (cancelled) return;
      unsub = subscribeRelayRoles(relayUrl, authors, onChange);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }

  if (authors.length === 0) return () => {};

  const catalogD = roleCatalogDTag(relayUrl);
  const holderAt = new Map<string, number>();
  let state: RelayRoles = EMPTY_RELAY_ROLES;
  let holdersUnsub: (() => void) | null = null;
  let holdersKey = '';

  const applyCatalog = (catalog: CachedCatalog) => {
    const live: Record<string, readonly string[]> = {};
    for (const role of catalog.roles) {
      const held = state.holders[role.id];
      if (held) live[role.id] = held;
    }
    state = { roles: sortRoles(catalog.roles), holders: live, updatedAt: catalog.updatedAt };
  };

  // One REQ covering every role's holder list; re-opened whenever the catalog
  // adds or drops a role (the `#d` values are derived from it).
  const syncHolders = () => {
    const dTags = state.roles.map((role) => roleHoldersDTag(relayUrl, role.id));
    const key = dTags.join('|');
    if (key === holdersKey) return;
    holdersKey = key;
    holdersUnsub?.();
    holdersUnsub = null;
    if (dTags.length === 0) return;

    for (const role of state.roles) {
      const cached = cacheGet<RoleHolders>(relayUrl, KIND_ROLES, roleHoldersDTag(relayUrl, role.id));
      if (!cached || cached.value.updatedAt <= (holderAt.get(role.id) ?? 0)) continue;
      holderAt.set(role.id, cached.value.updatedAt);
      state = { ...state, holders: { ...state.holders, [role.id]: cached.value.pubkeys } };
    }
    onChange(state);

    const filter: Filter = { kinds: [KIND_ROLES], authors: [...authors], '#d': dTags };
    holdersUnsub = impl.subscribeFilterWatched(filter, (ev) => {
      const parsed = parseRoleHolders(ev, relayUrl);
      if (!parsed || ev.created_at <= (holderAt.get(parsed.roleId) ?? 0)) return;
      holderAt.set(parsed.roleId, ev.created_at);
      cacheSet(relayUrl, KIND_ROLES, roleHoldersDTag(relayUrl, parsed.roleId), parsed);
      state = { ...state, holders: { ...state.holders, [parsed.roleId]: parsed.pubkeys } };
      onChange(state);
    });
  };

  // Stale-while-revalidate: badges paint from cache instead of popping in a
  // second after the message they belong to.
  const cachedCatalog = cacheGet<CachedCatalog>(relayUrl, KIND_ROLES, catalogD);
  if (cachedCatalog) {
    applyCatalog(cachedCatalog.value);
    onChange(state);
    syncHolders();
  }

  const catalogFilter: Filter = { kinds: [KIND_ROLES], authors: [...authors], '#d': [catalogD] };
  const catalogUnsub = impl.subscribeFilterWatched(catalogFilter, (ev) => {
    if (ev.created_at <= state.updatedAt) return;
    const parsed = parseRoleCatalog(ev);
    cacheSet<CachedCatalog>(relayUrl, KIND_ROLES, catalogD, { roles: parsed.roles, updatedAt: parsed.updatedAt });
    applyCatalog(parsed);
    onChange(state);
    syncHolders();
  });

  return () => {
    catalogUnsub();
    holdersUnsub?.();
  };
}

async function publishRoleEvent(relayUrl: string, dTag: string, tags: string[][]): Promise<NostrEvent> {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new CodedError('not-ready', 'nostr bridge not initialized');
  const previousAt = publishedAt.get(dTag) ?? 0;
  const event = await impl.publishEvent(
    {
      kind: KIND_ROLES,
      content: '',
      tags,
      created_at: Math.max(Math.floor(Date.now() / 1000), previousAt + 1),
    },
    { extraRelays: [relayUrl], mode: 'replace' },
  );
  publishedAt.set(dTag, event.created_at);
  return event;
}

export async function publishRoleCatalog(
  relayUrl: string,
  roles: ReadonlyArray<RelayRole>,
): Promise<void> {
  const dTag = roleCatalogDTag(relayUrl);
  const event = await publishRoleEvent(relayUrl, dTag, toRoleCatalogTags(roles, relayUrl));
  cacheSet<CachedCatalog>(relayUrl, KIND_ROLES, dTag, {
    roles: parseRoleCatalog(event).roles,
    updatedAt: event.created_at,
  });
}

export async function publishRoleHolders(
  relayUrl: string,
  roleId: string,
  pubkeys: ReadonlyArray<string>,
): Promise<void> {
  const id = normalizeRoleId(roleId);
  if (!ROLE_ID_RE.test(id)) throw new Error('invalid role id');
  const dTag = roleHoldersDTag(relayUrl, id);
  const event = await publishRoleEvent(relayUrl, dTag, toRoleHoldersTags(relayUrl, id, pubkeys));
  const parsed = parseRoleHolders(event, relayUrl);
  if (parsed) cacheSet(relayUrl, KIND_ROLES, dTag, parsed);
}
