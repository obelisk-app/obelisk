import type { Event as NostrEvent } from 'nostr-tools/pure';
import { RequestCoalescer } from './coalescer';

export interface ProfileEntry {
  event: NostrEvent;
  parsed: {
    name?: string;
    displayName?: string;
    picture?: string;
    about?: string;
    nip05?: string;
  };
  lastCheckedAt: number;
}

const TTL_MS = 24 * 3600 * 1000;
const PROFILE_AGGREGATORS = ['wss://purplepag.es'];

let extraRelays: string[] = [];
export function setProfileTestRelays(relays: string[]): void { extraRelays = relays; }

const coalescer = new RequestCoalescer({ debounceMs: 50 });
const subscribers = new Map<string, Set<(p: ProfileEntry) => void>>();

export function _resetProfileCache(): void {
  subscribers.clear();
}

function key(me: string) { return `obelisk:profiles:${me}`; }
function read(me: string): Record<string, ProfileEntry> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(key(me)) ?? '{}'); } catch { return {}; }
}
function write(me: string, blob: Record<string, ProfileEntry>): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key(me), JSON.stringify(blob)); } catch { /* ignore */ }
}

function parseKind0(content: string): ProfileEntry['parsed'] {
  try {
    const r = JSON.parse(content);
    return {
      name: r.name,
      displayName: r.displayName ?? r.display_name,
      picture: r.picture ?? r.image,
      about: r.about,
      nip05: r.nip05,
    };
  } catch { return {}; }
}

function notify(me: string, partner: string, entry: ProfileEntry): void {
  subscribers.get(`${me}|${partner}`)?.forEach((cb) => cb(entry));
}

export interface GetProfileResult {
  profile: ProfileEntry | null;
  dispose?: () => void;
}

export function getProfile(
  me: string,
  partner: string,
  opts: { onUpdate?: (p: ProfileEntry) => void } = {},
): GetProfileResult {
  const blob = read(me);
  const cached = blob[partner];
  const stale = !cached || Date.now() - cached.lastCheckedAt > TTL_MS;

  if (opts.onUpdate) {
    const sub = `${me}|${partner}`;
    if (!subscribers.has(sub)) subscribers.set(sub, new Set());
    subscribers.get(sub)!.add(opts.onUpdate);
  }

  if (stale) {
    coalescer.enqueue({
      filters: [{ kinds: [0], authors: [partner], limit: 1 }],
      relays: [...PROFILE_AGGREGATORS, ...extraRelays],
      onEvent: (event: NostrEvent) => {
        if (event.kind !== 0 || event.pubkey !== partner) return;
        const current = read(me)[partner];
        if (current && current.event.created_at >= event.created_at) {
          // Same or older — bump lastCheckedAt without notifying.
          const fresh = { ...current, lastCheckedAt: Date.now() };
          const all = read(me);
          all[partner] = fresh;
          write(me, all);
          return;
        }
        const entry: ProfileEntry = {
          event,
          parsed: parseKind0(event.content),
          lastCheckedAt: Date.now(),
        };
        const all = read(me);
        all[partner] = entry;
        write(me, all);
        notify(me, partner, entry);
      },
    });
  }

  const dispose = opts.onUpdate
    ? () => subscribers.get(`${me}|${partner}`)?.delete(opts.onUpdate!)
    : undefined;

  return { profile: cached ?? null, dispose };
}
