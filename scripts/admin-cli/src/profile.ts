import { finalizeEvent } from 'nostr-tools/pure';
import { SimplePool } from 'nostr-tools/pool';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

// nostr-tools' SimplePool needs a WebSocket implementation when run from Node.
useWebSocketImplementation(WebSocket as any);

export const DEFAULT_PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

export type ProfileMetadata = {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
};

export function buildProfileMetadata(
  existing: ProfileMetadata | null,
  patch: ProfileMetadata,
): ProfileMetadata {
  const merged: ProfileMetadata = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === '') delete (merged as any)[k];
    else (merged as any)[k] = v;
  }
  return merged;
}

export function buildProfileEvent(
  secret: Uint8Array,
  metadata: ProfileMetadata,
  now: number = Math.floor(Date.now() / 1000),
) {
  return finalizeEvent(
    { kind: 0, created_at: now, tags: [], content: JSON.stringify(metadata) },
    secret,
  );
}

export type PublishResult = { relay: string; ok: boolean; error?: string };

export async function publishProfile(
  event: ReturnType<typeof finalizeEvent>,
  relays: string[],
  timeoutMs = 8000,
): Promise<PublishResult[]> {
  const pool = new SimplePool();
  try {
    const results = await Promise.all(
      pool.publish(relays, event as any).map((p, i) =>
        Promise.race([
          p.then(() => ({ relay: relays[i], ok: true } as PublishResult)),
          new Promise<PublishResult>((resolve) =>
            setTimeout(() => resolve({ relay: relays[i], ok: false, error: 'timeout' }), timeoutMs),
          ),
        ]).catch((err: any) => ({ relay: relays[i], ok: false, error: err?.message ?? String(err) })),
      ),
    );
    return results;
  } finally {
    pool.close(relays);
  }
}

export async function fetchExistingProfile(
  pubkey: string,
  relays: string[],
  timeoutMs = 5000,
): Promise<ProfileMetadata | null> {
  const pool = new SimplePool();
  try {
    const event = await Promise.race([
      pool.get(relays, { kinds: [0], authors: [pubkey] }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!event) return null;
    try { return JSON.parse((event as any).content) as ProfileMetadata; }
    catch { return null; }
  } finally {
    pool.close(relays);
  }
}
