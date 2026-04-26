import type { Event as NostrEvent } from 'nostr-tools/pure';
import { setFollowSet } from './dm-cache';

interface FollowsCacheShape {
  event: NostrEvent;
  pubkeys: string[];
  lastCheckedAt: number;
}

const inMemory = new Map<string, FollowsCacheShape | null>();

export function _resetFollows(): void {
  inMemory.clear();
}

function key(me: string) { return `obelisk:follows:${me}`; }
function read(me: string): FollowsCacheShape | null {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(key(me)) ?? 'null'); } catch { return null; }
}
function write(me: string, shape: FollowsCacheShape): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(shape)); } catch { /* ignore */ }
}

export function hydrateFollows(me: string): void {
  const cached = read(me);
  if (cached) {
    inMemory.set(me, cached);
    setFollowSet(me, new Set(cached.pubkeys));
  } else {
    inMemory.set(me, null);
    setFollowSet(me, null);
  }
}

export function ingestKind3(me: string, event: NostrEvent): void {
  if (event.kind !== 3 || event.pubkey !== me) return;
  const current = inMemory.get(me) ?? null;
  if (current && current.event.created_at >= event.created_at) return;
  const pubkeys = event.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string').map((t) => t[1]);
  const shape: FollowsCacheShape = { event, pubkeys, lastCheckedAt: Date.now() };
  inMemory.set(me, shape);
  write(me, shape);
  setFollowSet(me, new Set(pubkeys));
}

export function getFollowSet(me: string): Set<string> | null {
  const v = inMemory.get(me);
  if (!v) return null;
  return new Set(v.pubkeys);
}
