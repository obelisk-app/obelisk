import NDK, { NDKUser } from '@nostr-dev-kit/ndk';
import type { NostrProfile } from './nostr';

// Server-side NDK instance for profile fetching (separate from client singleton)
let serverNDK: NDK | null = null;

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

function getServerNDK(): NDK {
  if (!serverNDK) {
    serverNDK = new NDK({ explicitRelayUrls: [...RELAYS] });
  }
  return serverNDK;
}

async function ensureConnected(): Promise<NDK> {
  const ndk = getServerNDK();
  await ndk.connect();

  // Wait until at least one relay is actually connected (up to 5s)
  const hasConnectedRelay = () =>
    Array.from(ndk.pool?.relays?.values() ?? []).some(
      (r) => r.connectivity?.status === 1,
    );

  if (!hasConnectedRelay()) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (hasConnectedRelay()) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 5000);
    });
  }

  return ndk;
}

function parseNDKProfile(user: NDKUser): Partial<NostrProfile> {
  const p = user.profile || {};
  return {
    name: p.name,
    displayName: (p.displayName || p.display_name) as string | undefined,
    about: p.about as string | undefined,
    picture: (p.image || p.picture) as string | undefined,
    banner: p.banner,
    nip05: p.nip05,
    lud16: p.lud16,
    website: p.website,
  };
}

/**
 * Fetch a profile from Nostr relays. Returns null on failure.
 */
export async function fetchProfileFromRelay(pubkey: string): Promise<Partial<NostrProfile> | null> {
  try {
    const ndk = await ensureConnected();
    const user = ndk.getUser({ pubkey });
    await Promise.race([
      user.fetchProfile(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    if (!user.profile) return null;
    return parseNDKProfile(user);
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
 */
export async function fetchAndSyncProfile(pubkey: string, serverId: string) {
  const profile = await fetchProfileFromRelay(pubkey);
  if (!profile) return null;
  return syncProfileToDb(pubkey, serverId, profile);
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
 * Look up a Member's cached profile to embed in a Socket.io `new-message`
 * event. Returns null if the author is not a Member of the server (e.g. the
 * system welcome bot). If the Member exists but has no cached profile, fires
 * a background fetch (non-blocking) so the next emit has data.
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
