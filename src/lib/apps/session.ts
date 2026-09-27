/**
 * Host-side view of an app session (obelisk-apps docs/app-format.md §2).
 *
 * The host understands five ops — create, join, leave, cancel, status — and
 * nothing else. Game rules, turns and boards live in the app and are replayed
 * inside the sandbox; out here a session is just: which app, pinned to which
 * files, who is in it, is it closed, and the one-line status for the chat card.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SESSION } from '@/lib/nip-kinds';

import { aggregateHash, readPaths, type AppPath } from './manifest';

export const APP_TAG = 'obelisk-app';
/** Pre-migration tables carried this `t` tag and a `game` name, no pin. */
export const LEGACY_GAME_TAG = 'obelisk-game';
export const STATUS_MAX_CHARS = 140;
/** A session nobody started stops being interesting after an hour (as dex games did). */
export const WAITING_EXPIRY_S = 60 * 60;
/** History window for the channel subscription. */
export const SESSION_LOG_WINDOW_S = 24 * 60 * 60;

export interface SessionPin {
  /** `32390:<author>:<d>`. */
  address: string;
  aggregate: string;
  paths: AppPath[];
  api: number;
}

export interface SessionSummary {
  id: string;
  channelId: string;
  createdBy: string;
  createdAt: number;
  /** Null for a legacy table; see `legacyGame`. */
  pin: SessionPin | null;
  /** Pre-migration `create` only: `chain-reaction` / `vesta` / `stacker`. */
  legacyGame: string | null;
  /** Creator first, then joiners in order, minus anyone who left. */
  participants: string[];
  cancelled: boolean;
  /** The app's card line, from the creator or a participant; latest wins. */
  status: string | null;
  lastActivity: number;
  /** Every event in the session, sorted by (created_at, id). What the app replays. */
  events: NostrEvent[];
}

const tag = (ev: NostrEvent, name: string) => ev.tags.find((t) => t[0] === name)?.[1];

export function opOf(ev: NostrEvent): string | null {
  return ev.kind === KIND_APP_SESSION ? tag(ev, 'op') ?? null : null;
}

/** The session a non-create event belongs to (its root `e` tag). */
export function sessionRefOf(ev: NostrEvent): string | null {
  const e = ev.tags.find((t) => t[0] === 'e' && typeof t[1] === 'string' && /^[0-9a-f]{64}$/.test(t[1]));
  return e?.[1] ?? null;
}

/** Which session an event belongs to: its own id for a create, else its `e`. */
export function sessionIdOf(ev: NostrEvent): string | null {
  const op = opOf(ev);
  if (!op) return null;
  return op === 'create' ? ev.id : sessionRefOf(ev);
}

/**
 * The version pin a `create` carries: the manifest's `path` tags copied in,
 * the aggregate, the address. Hosts must refuse a create whose recomputed
 * aggregate doesn't match — otherwise players could be running different code.
 */
export function readPin(create: NostrEvent): SessionPin | null {
  const address = create.tags.find((t) => t[0] === 'a')?.[1];
  if (!address || !/^32390:[0-9a-f]{64}:[a-z0-9-]{1,32}$/.test(address)) return null;
  const paths = readPaths(create.tags);
  if (!paths) return null;
  const x = create.tags.find((t) => t[0] === 'x' && t[2] === 'aggregate')?.[1];
  if (!x || x !== aggregateHash(paths)) return null;
  const api = Number(tag(create, 'api'));
  return { address, aggregate: x, paths, api: Number.isInteger(api) && api >= 1 ? api : 1 };
}

function legacyGameOf(create: NostrEvent): string | null {
  if (!create.tags.some((t) => t[0] === 't' && t[1] === LEGACY_GAME_TAG)) return null;
  const fromTag = tag(create, 'game');
  if (fromTag) return fromTag;
  try {
    const body = JSON.parse(create.content) as { game?: unknown };
    return typeof body.game === 'string' ? body.game : null;
  } catch {
    return null;
  }
}

function byTime(a: NostrEvent, b: NostrEvent): number {
  return a.created_at !== b.created_at ? a.created_at - b.created_at : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Summarize a session from its events (any order). Null without a `create`,
 * or when the create pins nothing valid and isn't a legacy table.
 */
export function summarizeSession(events: readonly NostrEvent[]): SessionSummary | null {
  const log = [...events].sort(byTime);
  const create = log.find((ev) => opOf(ev) === 'create');
  if (!create) return null;
  const channelId = tag(create, 'h');
  if (!channelId) return null;

  const pin = readPin(create);
  const legacyGame = pin ? null : legacyGameOf(create);
  if (!pin && !legacyGame) return null;

  const mine = log.filter((ev) => ev.id === create.id || sessionRefOf(ev) === create.id);
  const participants = [create.pubkey];
  let cancelled = false;
  let status: string | null = null;

  for (const ev of mine) {
    switch (opOf(ev)) {
      case 'join':
        if (!cancelled && !participants.includes(ev.pubkey)) participants.push(ev.pubkey);
        break;
      case 'leave':
        if (ev.pubkey !== create.pubkey) {
          const i = participants.indexOf(ev.pubkey);
          if (i >= 0) participants.splice(i, 1);
        }
        break;
      case 'cancel':
        if (ev.pubkey === create.pubkey) cancelled = true;
        break;
      case 'status': {
        if (ev.pubkey !== create.pubkey && !participants.includes(ev.pubkey)) break;
        try {
          const text = (JSON.parse(ev.content) as { text?: unknown }).text;
          if (typeof text === 'string' && text.length <= STATUS_MAX_CHARS) status = text;
        } catch { /* ignore */ }
        break;
      }
    }
  }

  return {
    id: create.id,
    channelId,
    createdBy: create.pubkey,
    createdAt: create.created_at,
    pin,
    legacyGame,
    participants,
    cancelled,
    status,
    lastActivity: mine[mine.length - 1]?.created_at ?? create.created_at,
    events: mine,
  };
}

/** Marker posted as a kind 9 message; the legacy `[[game:…]]` form still parses. */
export const APP_MARKER_REGEX = /\[\[(?:app|game):([0-9a-f]{64})\]\]/g;

export function appMarker(sessionId: string): string {
  return `[[app:${sessionId}]]`;
}

/** All session ids referenced by a chat message body, in order, deduped. */
export function extractAppMarkers(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(APP_MARKER_REGEX)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}

/** The `create` template the host publishes when a user opens an app in a channel. */
export function buildSessionCreate(channelId: string, manifest: {
  address: string;
  aggregate: string;
  paths: readonly AppPath[];
  api: number;
  title: string;
}, nonce: string, relayHint = '') {
  return {
    kind: KIND_APP_SESSION,
    content: JSON.stringify({ nonce }),
    tags: [
      ['h', channelId],
      ['t', APP_TAG],
      ['op', 'create'],
      ['a', manifest.address, relayHint],
      ['x', manifest.aggregate, 'aggregate'],
      ...manifest.paths.map((p) => ['path', p.path, p.sha256]),
      ['api', String(manifest.api)],
      ['alt', `Obelisk app session: ${manifest.title}`],
    ],
  };
}
