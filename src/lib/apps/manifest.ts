/**
 * Kind 32390 app manifests (obelisk-app/obelisk-apps docs/app-format.md §1).
 *
 * A manifest is untrusted input from whoever could write to the active relay.
 * This module decides whether one is well-formed enough to list; it does not
 * decide whether it is *safe* to run — nothing is, which is why apps run in
 * the sandbox (see docs/apps.md).
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_MANIFEST } from '@/lib/nip-kinds';

/** Host API majors this build can run. */
export const SUPPORTED_APP_APIS = [1];

export const MAX_PATHS = 64;
const PATH_RE = /^\/[a-z0-9._/-]{1,128}$/;
const SLUG_RE = /^[a-z0-9-]{1,32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export interface AppPath {
  path: string;
  sha256: string;
}

export interface AppManifest {
  /** `32390:<author>:<d>` — the app's identity. */
  address: string;
  eventId: string;
  author: string;
  slug: string;
  title: string;
  description: string;
  /** Markdown, shown in the catalog. Never rendered as HTML. */
  content: string;
  api: number;
  /** false when `api` is newer than this build: listed, not runnable. */
  runnable: boolean;
  types: string[];
  version: string | null;
  players: { min: number; max: number } | null;
  realtime: boolean;
  paths: AppPath[];
  /** A `path` the catalog can show as the icon, if one was declared. */
  icon: string | null;
  aggregate: string;
  servers: string[];
  source: string | null;
  createdAt: number;
}

export function appAddress(author: string, slug: string): string {
  return `${KIND_APP_MANIFEST}:${author}:${slug}`;
}

/** NIP-5A aggregate: sort `<sha256> <path>\n` lines, concatenate, sha256. */
export function aggregateHash(paths: readonly AppPath[]): string {
  const text = paths.map((p) => `${p.sha256} ${p.path}\n`).sort().join('');
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

/** `path` tags out of any tag list (manifest or session `create`), validated. */
export function readPaths(tags: string[][]): AppPath[] | null {
  const out: AppPath[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (t[0] !== 'path') continue;
    const [, path, hash] = t;
    if (typeof path !== 'string' || typeof hash !== 'string') return null;
    if (!PATH_RE.test(path) || path.split('/').includes('..') || !HEX64.test(hash)) return null;
    if (seen.has(path)) return null;
    seen.add(path);
    out.push({ path, sha256: hash });
  }
  if (out.length === 0 || out.length > MAX_PATHS) return null;
  if (!out.some((p) => p.path === '/index.js')) return null;
  return out;
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Parse and validate one manifest event, or null when it must not be listed. */
export function parseManifest(ev: NostrEvent): AppManifest | null {
  if (ev.kind !== KIND_APP_MANIFEST || !HEX64.test(ev.pubkey)) return null;
  const tag = (name: string) => ev.tags.find((t) => t[0] === name);
  const all = (name: string) => ev.tags.filter((t) => t[0] === name);

  const slug = tag('d')?.[1];
  const title = tag('title')?.[1]?.trim();
  const api = Number(tag('api')?.[1]);
  if (!slug || !SLUG_RE.test(slug) || !title || !Number.isInteger(api) || api < 1) return null;

  const paths = readPaths(ev.tags);
  if (!paths) return null;
  const xs = all('x').filter((t) => t[2] === 'aggregate');
  if (xs.length !== 1 || xs[0][1] !== aggregateHash(paths)) return null;

  const playersTag = tag('players');
  const min = Number(playersTag?.[1]);
  const max = Number(playersTag?.[2]);
  const players = Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min && max <= 64
    ? { min, max }
    : null;

  const icon = tag('icon')?.[1];
  return {
    address: appAddress(ev.pubkey, slug),
    eventId: ev.id,
    author: ev.pubkey,
    slug,
    title: title.slice(0, 64),
    description: (tag('description')?.[1] ?? '').slice(0, 280),
    content: ev.content.slice(0, 16 * 1024),
    api,
    runnable: SUPPORTED_APP_APIS.includes(api),
    types: all('t').map((t) => t[1]).filter((t): t is string => typeof t === 'string' && t.length > 0).slice(0, 8),
    version: tag('version')?.[1]?.slice(0, 32) ?? null,
    players,
    realtime: tag('realtime')?.[1] === 'true',
    paths,
    icon: icon && paths.some((p) => p.path === icon) ? icon : null,
    aggregate: xs[0][1],
    servers: all('server').map((t) => httpsUrl(t[1])).filter((s): s is string => !!s).slice(0, 8),
    source: tag('source')?.[1] ?? null,
    createdAt: ev.created_at,
  };
}

/** Newest per address; ties to the lower id (app-format.md §1 Discovery). */
export function latestPerAddress(manifests: readonly AppManifest[]): AppManifest[] {
  const best = new Map<string, AppManifest>();
  for (const m of manifests) {
    const cur = best.get(m.address);
    if (!cur || m.createdAt > cur.createdAt || (m.createdAt === cur.createdAt && m.eventId < cur.eventId)) {
      best.set(m.address, m);
    }
  }
  return [...best.values()].sort((a, b) => a.title.localeCompare(b.title));
}
