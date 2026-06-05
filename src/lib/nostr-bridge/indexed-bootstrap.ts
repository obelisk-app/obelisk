import type { Event as NostrEvent } from 'nostr-tools';
import { normalizeRelayUrl } from './relay-url';

export interface IndexedBootstrapCapability {
  readonly relay: string;
  readonly bootstrapUrl: string;
}

export interface IndexedBootstrapGroup {
  readonly id: string;
  readonly events: readonly NostrEvent[];
  readonly nextBefore: number | null;
}

export interface IndexedBootstrapScope {
  readonly scope: string;
  readonly groups: readonly IndexedBootstrapGroup[];
}

export interface IndexedBootstrapPayload {
  readonly version: 1;
  readonly relay: string;
  readonly generatedAt: number;
  readonly cursorSince: number | null;
  readonly scopes: readonly IndexedBootstrapScope[];
}

export interface IndexedBootstrapResult {
  readonly capability: IndexedBootstrapCapability;
  readonly payload: IndexedBootstrapPayload;
}

export interface IndexedMessagesPage {
  readonly version: 1;
  readonly scope: string;
  readonly groupId: string;
  readonly events: readonly NostrEvent[];
  readonly nextBefore: number | null;
}

type SignEvent = (template: {
  kind: 27235;
  content: string;
  tags: string[][];
  created_at: number;
}) => Promise<NostrEvent>;

interface FetchLike {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

const DISCOVERY_TIMEOUT_MS = 2500;
const BOOTSTRAP_TIMEOUT_MS = 6000;
const MESSAGES_TIMEOUT_MS = 5000;

function relayHttpBase(relay: string): string | null {
  try {
    const url = new URL(relay);
    if (url.protocol === 'wss:') url.protocol = 'https:';
    else if (url.protocol === 'ws:') url.protocol = 'http:';
    else return null;
    url.pathname = url.pathname || '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return {
    signal: ctl.signal,
    clear: () => clearTimeout(timer),
  };
}

function base64Utf8(value: string): string {
  if (typeof btoa === 'function') {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary);
  }
  return Buffer.from(value, 'utf8').toString('base64');
}

export function nip98Authorization(event: NostrEvent): string {
  return `Nostr ${base64Utf8(JSON.stringify(event))}`;
}

function isStringArrayArray(value: unknown): value is string[][] {
  return Array.isArray(value)
    && value.every((tag) => Array.isArray(tag) && tag.every((item) => typeof item === 'string'));
}

export function isRawNostrEvent(value: unknown): value is NostrEvent {
  if (!value || typeof value !== 'object') return false;
  const ev = value as Partial<NostrEvent>;
  return typeof ev.id === 'string'
    && typeof ev.pubkey === 'string'
    && typeof ev.created_at === 'number'
    && Number.isFinite(ev.created_at)
    && typeof ev.kind === 'number'
    && Number.isFinite(ev.kind)
    && isStringArrayArray(ev.tags)
    && typeof ev.content === 'string'
    && typeof ev.sig === 'string';
}

function parseCapability(relay: string, json: unknown): IndexedBootstrapCapability | null {
  const root = json as {
    obelisk?: {
      indexed_bootstrap?: {
        version?: unknown;
        url?: unknown;
        auth?: unknown;
      };
    };
  };
  const advertised = root?.obelisk?.indexed_bootstrap;
  if (!advertised || advertised.version !== 1 || advertised.auth !== 'nip98') return null;
  if (typeof advertised.url !== 'string' || advertised.url.length === 0) return null;
  const base = relayHttpBase(relay);
  if (!base) return null;
  let bootstrapUrl: string;
  try {
    bootstrapUrl = new URL(advertised.url, base).toString();
  } catch {
    return null;
  }
  return { relay: normalizeRelayUrl(relay), bootstrapUrl };
}

export async function discoverIndexedBootstrap(
  relay: string,
  fetchImpl: FetchLike = fetch,
): Promise<IndexedBootstrapCapability | null> {
  const base = relayHttpBase(relay);
  if (!base) return null;
  const timeout = timeoutSignal(DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(base, {
      headers: { Accept: 'application/nostr+json' },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    return parseCapability(relay, await res.json());
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export function buildBootstrapUrl(capability: IndexedBootstrapCapability, limitPerGroup: number): string {
  const url = new URL(capability.bootstrapUrl);
  url.searchParams.set('limit_per_group', String(limitPerGroup));
  return url.toString();
}

export function buildGroupMessagesUrl(
  capability: IndexedBootstrapCapability,
  groupId: string,
  opts: { before: number; limit: number; scope?: string | null },
): string {
  const url = new URL(capability.bootstrapUrl);
  const prefix = url.pathname.endsWith('/bootstrap')
    ? url.pathname.slice(0, -'/bootstrap'.length)
    : url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/groups/${encodeURIComponent(groupId)}/messages`;
  url.search = '';
  if (opts.scope) url.searchParams.set('scope', opts.scope);
  url.searchParams.set('before', String(opts.before));
  url.searchParams.set('limit', String(opts.limit));
  return url.toString();
}

async function signNip98(signEvent: SignEvent, url: string): Promise<string> {
  const event = await signEvent({
    kind: 27235,
    content: '',
    tags: [
      ['u', url],
      ['method', 'GET'],
    ],
    created_at: Math.floor(Date.now() / 1000),
  });
  return nip98Authorization(event);
}

function parseGroups(value: unknown): IndexedBootstrapGroup[] | null {
  if (!Array.isArray(value)) return null;
  const out: IndexedBootstrapGroup[] = [];
  for (const raw of value) {
    const g = raw as { id?: unknown; events?: unknown; next_before?: unknown };
    if (typeof g.id !== 'string' || !Array.isArray(g.events)) return null;
    const events: NostrEvent[] = [];
    for (const ev of g.events) {
      if (!isRawNostrEvent(ev)) return null;
      events.push(ev);
    }
    const nextBefore = typeof g.next_before === 'number' && Number.isFinite(g.next_before)
      ? g.next_before
      : null;
    out.push({ id: g.id, events, nextBefore });
  }
  return out;
}

export function parseIndexedBootstrapPayload(json: unknown): IndexedBootstrapPayload | null {
  const payload = json as {
    version?: unknown;
    relay?: unknown;
    generated_at?: unknown;
    cursor?: { since?: unknown };
    scopes?: unknown;
  };
  if (payload.version !== 1) return null;
  if (typeof payload.relay !== 'string') return null;
  if (typeof payload.generated_at !== 'number' || !Number.isFinite(payload.generated_at)) return null;
  if (!Array.isArray(payload.scopes)) return null;

  const scopes: IndexedBootstrapScope[] = [];
  for (const rawScope of payload.scopes) {
    const s = rawScope as { scope?: unknown; groups?: unknown };
    if (typeof s.scope !== 'string') return null;
    const groups = parseGroups(s.groups);
    if (!groups) return null;
    scopes.push({ scope: s.scope, groups });
  }

  const cursorSince = typeof payload.cursor?.since === 'number' && Number.isFinite(payload.cursor.since)
    ? payload.cursor.since
    : null;
  return {
    version: 1,
    relay: normalizeRelayUrl(payload.relay),
    generatedAt: payload.generated_at,
    cursorSince,
    scopes,
  };
}

export function parseIndexedMessagesPage(json: unknown): IndexedMessagesPage | null {
  const page = json as {
    version?: unknown;
    scope?: unknown;
    group_id?: unknown;
    events?: unknown;
    next_before?: unknown;
  };
  if (page.version !== 1) return null;
  if (typeof page.scope !== 'string') return null;
  if (typeof page.group_id !== 'string') return null;
  if (!Array.isArray(page.events)) return null;
  const events: NostrEvent[] = [];
  for (const ev of page.events) {
    if (!isRawNostrEvent(ev)) return null;
    events.push(ev);
  }
  const nextBefore = typeof page.next_before === 'number' && Number.isFinite(page.next_before)
    ? page.next_before
    : null;
  return {
    version: 1,
    scope: page.scope,
    groupId: page.group_id,
    events,
    nextBefore,
  };
}

export async function fetchIndexedBootstrap(opts: {
  relay: string;
  limitPerGroup: number;
  signEvent: SignEvent;
  fetchImpl?: FetchLike;
}): Promise<IndexedBootstrapResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const capability = await discoverIndexedBootstrap(opts.relay, fetchImpl);
  if (!capability) return null;
  const url = buildBootstrapUrl(capability, opts.limitPerGroup);
  let authorization: string;
  try {
    authorization = await signNip98(opts.signEvent, url);
  } catch {
    return null;
  }
  const timeout = timeoutSignal(BOOTSTRAP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
      },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const payload = parseIndexedBootstrapPayload(await res.json());
    if (!payload) return null;
    return { capability, payload };
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export async function fetchIndexedGroupMessages(opts: {
  capability: IndexedBootstrapCapability;
  groupId: string;
  before: number;
  limit: number;
  scope?: string | null;
  signEvent: SignEvent;
  fetchImpl?: FetchLike;
}): Promise<IndexedMessagesPage | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = buildGroupMessagesUrl(opts.capability, opts.groupId, {
    before: opts.before,
    limit: opts.limit,
    scope: opts.scope,
  });
  let authorization: string;
  try {
    authorization = await signNip98(opts.signEvent, url);
  } catch {
    return null;
  }
  const timeout = timeoutSignal(MESSAGES_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        Authorization: authorization,
      },
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const page = parseIndexedMessagesPage(await res.json());
    if (!page || page.groupId !== opts.groupId) return null;
    return page;
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}
