import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';
import type { NostrProfile } from './nostr';

// nostr-tools needs a WebSocket implementation in Node. Set it once at
// module load (idempotent if other modules also call it).
useWebSocketImplementation(WebSocket);

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

// Server-side relay pool. We deliberately use nostr-tools instead of NDK
// here because NDK's `connect()` promise never resolves in Node and its
// `fetchEvents` hangs even after the underlying WebSockets are open. NDK is
// still used everywhere else (browser, signing, NIP-46) — this module is the
// only server-side relay reader.
let serverPool: SimplePool | null = null;
function getServerPool(): SimplePool {
  if (!serverPool) {
    serverPool = new SimplePool();
  }
  return serverPool;
}

interface RawKind0Content {
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  about?: unknown;
  picture?: unknown;
  image?: unknown;
  banner?: unknown;
  nip05?: unknown;
  lud16?: unknown;
  website?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function parseKind0Content(content: string): Partial<NostrProfile> | null {
  let raw: RawKind0Content;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  return {
    name: asString(raw.name),
    displayName: asString(raw.displayName) || asString(raw.display_name),
    about: asString(raw.about),
    picture: asString(raw.picture) || asString(raw.image),
    banner: asString(raw.banner),
    nip05: asString(raw.nip05),
    lud16: asString(raw.lud16),
    website: asString(raw.website),
  };
}

/**
 * Fetch a profile from Nostr relays via a direct kind:0 query.
 *
 * Uses nostr-tools `SimplePool.querySync` for the server-side relay query.
 *
 * Return values:
 *   - `null`             — transport failure (timeout, no relays connected). Caller should retry later.
 *   - `{}`               — successfully queried but no kind 0 event found. Caller should mark as checked.
 *   - `{ name, ... }`    — event found and parsed.
 */
export async function fetchProfileFromRelay(pubkey: string): Promise<Partial<NostrProfile> | null> {
  try {
    const pool = getServerPool();
    const events = await pool.querySync(
      RELAYS,
      { kinds: [0], authors: [pubkey], limit: 1 },
      { maxWait: 8000 },
    );

    // Pick the newest event (relays may return multiple)
    let newest: { content: string; created_at: number } | null = null;
    for (const ev of events) {
      const created = ev.created_at ?? 0;
      if (!newest || created > newest.created_at) {
        newest = { content: ev.content, created_at: created };
      }
    }
    if (!newest) return {};

    return parseKind0Content(newest.content) ?? {};
  } catch (err) {
    console.warn(`[profile-sync] Failed to fetch profile for ${pubkey.slice(0, 8)}:`, err);
    return null;
  }
}

// Use dynamic import to work in both Next.js API and server.ts contexts
async function getPrisma() {
  const { prisma } = await import('./db-server');
  return prisma;
}

/**
 * Sync profile data to the Member table for a given pubkey+server.
 *
 * `markFresh` (default true) stamps `profileUpdatedAt = now`. Pass `false`
 * when writing an incomplete profile (e.g. only name+picture) so the stale
 * refresh pass can still pick it up for a full relay fetch later.
 */
export async function syncProfileToDb(
  pubkey: string,
  serverId: string,
  profile: Partial<NostrProfile>,
  options: { markFresh?: boolean } = {},
) {
  const { markFresh = true } = options;
  const prisma = await getPrisma();
  const data: Record<string, unknown> = {
    displayName: profile.displayName || profile.name || null,
    picture: profile.picture || null,
    nip05: profile.nip05 || null,
    about: profile.about || null,
    banner: profile.banner || null,
    lud16: profile.lud16 || null,
    website: profile.website || null,
  };
  if (markFresh) {
    data.profileUpdatedAt = new Date();
  }

  return prisma.member.upsert({
    where: { serverId_pubkey: { serverId, pubkey } },
    update: data,
    create: { serverId, pubkey, role: 'member', ...data },
  });
}

/**
 * Fetch profile from relay and save to DB.
 *
 * Always marks the row as fresh on a successful query (even when the relay
 * had no kind 0 event for the pubkey) — otherwise users who genuinely have
 * no profile would be re-queried on every refresh pass forever.
 *
 * Only `null` from the fetcher (transport failure) leaves the row stale so
 * the next refresh pass picks it up again.
 */
export async function fetchAndSyncProfile(pubkey: string, serverId: string) {
  const profile = await fetchProfileFromRelay(pubkey);
  if (profile === null) return null;
  return syncProfileToDb(pubkey, serverId, profile, { markFresh: true });
}

/**
 * Dedupes concurrent profile fetches for the same `(serverId, pubkey)` pair.
 * All concurrent callers share one relay round-trip.
 */
const inFlight = new Map<string, Promise<Awaited<ReturnType<typeof fetchAndSyncProfile>>>>();

export function fetchAndSyncProfileDeduped(pubkey: string, serverId: string) {
  const key = `${serverId}:${pubkey}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchAndSyncProfile(pubkey, serverId).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/**
 * Fire-and-forget opportunistic background refresh. Triggered on hot reads
 * (GET /api/members, GET /api/admin/members) to keep profile data fresh
 * automatically without a cron job.
 *
 * Per-server cooldown (default 60s) prevents thrash when many users hit
 * /api/members in quick succession. Returns immediately; the actual refresh
 * runs in the background.
 */
const lastRefreshByServer = new Map<string, number>();
const REFRESH_COOLDOWN_MS = 60_000;

export async function triggerBackgroundRefreshIfStale(
  serverId: string,
  ttlHours = 6,
): Promise<void> {
  const now = Date.now();
  const last = lastRefreshByServer.get(serverId) ?? 0;
  if (now - last < REFRESH_COOLDOWN_MS) return;

  const prisma = await getPrisma();
  const cutoff = new Date(now - ttlHours * 60 * 60 * 1000);
  const staleCount = await prisma.member.count({
    where: {
      serverId,
      OR: [
        { profileUpdatedAt: null },
        { profileUpdatedAt: { lt: cutoff } },
      ],
    },
  });
  if (staleCount === 0) return;

  lastRefreshByServer.set(serverId, now);
  // Fire-and-forget — errors are logged inside refreshStaleProfiles.
  void refreshStaleProfiles(ttlHours / 24, serverId).catch((err) => {
    console.warn('[profile-sync] Background refresh failed:', err);
  });
}

/**
 * Shape of the author profile embedded in real-time `new-message` events.
 * Kept small on purpose — chat clients only need these fields to render.
 */
export interface EmbeddedAuthorProfile {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  nickname: string | null;
}

/**
 * The "system bot" pubkey. Any message posted with this author is assumed
 * to come from the server itself (welcome bot, server announcements, etc.).
 * Clients see the server's name + icon in place of an actual user profile.
 */
export const SYSTEM_PUBKEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * The "zap bot" pubkey. Messages authored with this pubkey are rendered as
 * coming from a dedicated "Zap Bot" with a ⚡ avatar, regardless of server.
 * Used by `/api/wallet/zap` to post public zap notifications on behalf of
 * the zapper so the sender's npub isn't shown as the message author.
 */
export const ZAP_BOT_PUBKEY =
  '000000000000000000000000000000000000000000000000000000007a617000';

/**
 * Look up a Member's cached profile to embed in a Socket.io `new-message`
 * event. Returns null if the author is not a Member of the server. If the
 * Member exists but has no cached profile, fires a background fetch
 * (non-blocking) so the next emit has data.
 *
 * Special case: when `pubkey === SYSTEM_PUBKEY`, returns a synthetic profile
 * derived from the server (name + icon), so system messages render with the
 * server logo and name instead of a generic placeholder.
 *
 * Callers: every site that emits `new-message` — src/server.ts,
 * src/app/api/channels/[channelId]/messages/route.ts,
 * src/app/api/channels/[channelId]/posts/[postId]/route.ts,
 * src/lib/welcome.ts.
 */
export async function getAuthorProfile(
  pubkey: string,
  serverId: string,
): Promise<EmbeddedAuthorProfile | null> {
  try {
    const prisma = await getPrisma();

    if (pubkey === ZAP_BOT_PUBKEY) {
      return {
        pubkey: ZAP_BOT_PUBKEY,
        displayName: 'Zap Bot',
        picture: '/bots/zap.svg',
        nip05: null,
        nickname: null,
      };
    }

    if (pubkey === SYSTEM_PUBKEY) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { name: true, icon: true },
      });
      if (!server) return null;
      return {
        pubkey: SYSTEM_PUBKEY,
        displayName: server.name,
        picture: server.icon,
        nip05: null,
        nickname: null,
      };
    }

    const member = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: {
        pubkey: true,
        displayName: true,
        picture: true,
        nip05: true,
        nickname: true,
        profileUpdatedAt: true,
      },
    });
    if (!member) return null;

    // If the row exists but has no cached profile, trigger a background
    // fetch so the NEXT emit has data. Non-blocking.
    if (member.profileUpdatedAt === null) {
      void fetchAndSyncProfileDeduped(pubkey, serverId).catch(() => {});
    }

    return {
      pubkey: member.pubkey,
      displayName: member.displayName,
      picture: member.picture,
      nip05: member.nip05,
      nickname: member.nickname,
    };
  } catch {
    return null;
  }
}

/**
 * Test helper: clears module-level dedup and cooldown state. Do not call
 * from production code.
 */
export function __resetProfileSyncState() {
  inFlight.clear();
  lastRefreshByServer.clear();
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Refresh profiles that are stale (older than maxAgeDays) or never fetched.
 */
export async function refreshStaleProfiles(
  maxAgeDays = 1,
  serverId?: string
): Promise<number> {
  const prisma = await getPrisma();
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

  const staleMembers = await prisma.member.findMany({
    where: {
      ...(serverId ? { serverId } : {}),
      OR: [
        { profileUpdatedAt: null },
        { profileUpdatedAt: { lt: cutoff } },
      ],
    },
    select: { pubkey: true, serverId: true },
  });

  if (staleMembers.length === 0) return 0;
  console.log(`[profile-sync] Refreshing ${staleMembers.length} stale profiles...`);

  let updated = 0;
  for (const member of staleMembers) {
    const result = await fetchAndSyncProfile(member.pubkey, member.serverId);
    if (result) updated++;
    await sleep(150); // rate limit relay requests
  }

  console.log(`[profile-sync] Updated ${updated}/${staleMembers.length} profiles`);
  return updated;
}

/**
 * Backfill members with no cached profile data (past users).
 */
export async function backfillMissingProfiles(): Promise<number> {
  const prisma = await getPrisma();

  const missing = await prisma.member.findMany({
    where: {
      displayName: null,
      picture: null,
      profileUpdatedAt: null,
    },
    select: { pubkey: true, serverId: true },
  });

  if (missing.length === 0) {
    console.log('[profile-sync] No profiles to backfill');
    return 0;
  }

  console.log(`[profile-sync] Backfilling ${missing.length} missing profiles...`);
  let updated = 0;
  for (const member of missing) {
    const result = await fetchAndSyncProfile(member.pubkey, member.serverId);
    if (result) updated++;
    await sleep(150);
  }

  console.log(`[profile-sync] Backfilled ${updated}/${missing.length} profiles`);
  return updated;
}
