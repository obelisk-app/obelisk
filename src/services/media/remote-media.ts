'use client';

/**
 * Who may make this browser fetch media from a host they chose.
 *
 * Every `<img src>`, `<video src>` and `<audio src>` in a message is a URL
 * picked by whoever wrote the message. Rendering it makes the reader's
 * browser connect to that host, which hands the author the reader's IP
 * address, user agent and the time of reading: a read receipt nobody agreed
 * to. In a public channel that receipt is one of many; in a DM it is
 * targeted at one person. Hence two surfaces with two defaults:
 *
 *   | surface   | default    | meaning                                          |
 *   |-----------|------------|--------------------------------------------------|
 *   | `channel` | `contacts` | auto-load from people you follow or your WoT     |
 *   |           |            | admits; a placeholder for everyone else          |
 *   | `dm`      | `ask`      | a placeholder for every incoming message          |
 *
 * Your own messages always load: you chose the URL. Same-origin URLs (the
 * welcome banner, `/uploads/`) always load: the origin already has your IP.
 *
 * The placeholder is per message and per reader: tapping it reveals that
 * message's media only. The setting itself is changed in Settings (see
 * `setRemoteMediaMode`). This module is pure state and policy; the React
 * gate that joins it to the bridge lives in `./remote-media-gate.ts`.
 *
 * Why not a proxy: moving the fetch to our own server would remove the leak
 * entirely, but it is a new server route with the same SSRF surface as
 * `src/app/api/link-preview/route.ts` and a bandwidth bill. Until that
 * exists, not loading is the only option that does not leak.
 */

import { createLocalStore } from '@/services/common/local-store';
import { REMOTE_MEDIA_DEFAULTS } from '@/constants/media/remote-media';

export type RemoteMediaSurface = 'channel' | 'dm';
export type RemoteMediaMode = 'always' | 'contacts' | 'ask';

export interface RemoteMediaSettings {
  channel: RemoteMediaMode;
  dm: RemoteMediaMode;
}

const MODES = new Set<RemoteMediaMode>(['always', 'contacts', 'ask']);

export function normalizeRemoteMediaSettings(raw: unknown): RemoteMediaSettings {
  const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const pick = (surface: RemoteMediaSurface): RemoteMediaMode => {
    const v = obj[surface];
    return MODES.has(v as RemoteMediaMode) ? (v as RemoteMediaMode) : REMOTE_MEDIA_DEFAULTS[surface];
  };
  return { channel: pick('channel'), dm: pick('dm') };
}

const store = createLocalStore<Partial<RemoteMediaSettings>>('obelisk:remote-media', {});
let current: RemoteMediaSettings = normalizeRemoteMediaSettings(store.load());
const listeners = new Set<() => void>();

export function getRemoteMediaSettings(): RemoteMediaSettings {
  return current;
}

export function setRemoteMediaMode(surface: RemoteMediaSurface, mode: RemoteMediaMode): void {
  const next = normalizeRemoteMediaSettings({ ...current, [surface]: mode });
  if (next[surface] === current[surface]) return;
  current = next;
  store.save(current);
  listeners.forEach((l) => l());
}

/** Non-React change listener. Returns an unsubscribe. */
export function subscribeRemoteMedia(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** @internal Test helper: back to defaults, in memory and on disk. */
export function _resetRemoteMediaForTest(): void {
  current = { ...REMOTE_MEDIA_DEFAULTS };
  store.save({});
  listeners.forEach((l) => l());
}

export interface RemoteMediaSender {
  /** The message author, or `null` when the caller cannot tell. */
  pubkey: string | null;
  /** The reader wrote this message. */
  own: boolean;
}

export interface RemoteMediaTrust {
  /** Pubkeys the reader follows (kind 3). */
  follows: ReadonlyArray<string> | ReadonlySet<string>;
  /** A resolved WoT allow verdict for `pubkey`, as `wotEngine.getDistance`. Optional. */
  wotDistance?: (pubkey: string) => number | null;
}

/**
 * The policy decision. Pure: no store reads, so it can be tested without
 * a bridge and reused by anything that renders a sender-chosen URL.
 */
export function mayAutoLoadRemoteMedia(
  mode: RemoteMediaMode,
  sender: RemoteMediaSender,
  trust: RemoteMediaTrust,
): boolean {
  if (sender.own) return true;
  if (mode === 'always') return true;
  if (mode === 'ask') return false;
  // `contacts`: an unknown author is a stranger, not a contact.
  if (!sender.pubkey) return false;
  const follows = trust.follows;
  const followed = follows instanceof Set
    ? follows.has(sender.pubkey)
    : (follows as ReadonlyArray<string>).includes(sender.pubkey);
  if (followed) return true;
  const distance = trust.wotDistance?.(sender.pubkey) ?? null;
  return distance !== null;
}

