/**
 * Web of Trust subsystem for anti-spam server registration.
 *
 * Each server can designate a "referente" pubkey. Anyone the referente
 * follows on Nostr (kind 3 contact list) is auto-admitted to the server.
 * The follow list is cached locally in WotEntry rows and refreshed lazily.
 *
 * See docs/wot-and-invite-credits.md for full feature documentation.
 */
import { prisma } from './db';
import { fetchFollowing } from './nostr';

export type WotReason = 'follow' | 'override' | 'none';

export interface WotCheck {
  allowed: boolean;
  reason: WotReason;
}

export interface WotRefreshResult {
  added: number;
  removed: number;
  total: number;
  fetchedAt: Date;
}

const STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Force-refresh the cached follow list of a server's referente from relays.
 * Diffs against existing WotEntry rows and applies adds/removes in a transaction.
 *
 * Throws if the server has no referentePubkey set.
 */
export async function refreshWot(serverId: string): Promise<WotRefreshResult> {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, referentePubkey: true },
  });
  if (!server) throw new Error(`Server ${serverId} not found`);
  if (!server.referentePubkey) {
    throw new Error('Server has no referentePubkey configured');
  }

  // Fetch current follow list from Nostr relays.
  const follows = await fetchFollowing(server.referentePubkey);
  const followSet = new Set(follows);

  // Load existing cached entries.
  const existing = await prisma.wotEntry.findMany({
    where: { serverId },
    select: { pubkey: true },
  });
  const existingSet = new Set(existing.map((e) => e.pubkey));

  const toAdd = follows.filter((p) => !existingSet.has(p));
  const toRemove = [...existingSet].filter((p) => !followSet.has(p));

  const fetchedAt = new Date();

  await prisma.$transaction([
    ...(toAdd.length > 0
      ? [
          prisma.wotEntry.createMany({
            data: toAdd.map((pubkey) => ({ serverId, pubkey })),
            skipDuplicates: true,
          }),
        ]
      : []),
    ...(toRemove.length > 0
      ? [
          prisma.wotEntry.deleteMany({
            where: { serverId, pubkey: { in: toRemove } },
          }),
        ]
      : []),
    prisma.server.update({
      where: { id: serverId },
      data: { referenteFetchedAt: fetchedAt },
    }),
  ]);

  return {
    added: toAdd.length,
    removed: toRemove.length,
    total: followSet.size,
    fetchedAt,
  };
}

/**
 * Check whether a pubkey is allowed by the server's WoT.
 * Returns { allowed, reason } where reason explains the source of the allow.
 */
export async function isInWot(
  serverId: string,
  pubkey: string
): Promise<WotCheck> {
  const [entry, override] = await Promise.all([
    prisma.wotEntry.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { id: true },
    }),
    prisma.wotOverride.findUnique({
      where: { serverId_pubkey: { serverId, pubkey } },
      select: { id: true },
    }),
  ]);

  if (entry) return { allowed: true, reason: 'follow' };
  if (override) return { allowed: true, reason: 'override' };
  return { allowed: false, reason: 'none' };
}

/**
 * Refresh the WoT cache only if it is stale. Fire-and-forget — never blocks
 * the caller on relay failure. Safe to call from request handlers.
 */
export async function maybeAutoRefreshWot(
  serverId: string,
  staleAfterMs = STALE_AFTER_MS
): Promise<void> {
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { referentePubkey: true, referenteFetchedAt: true, wotEnabled: true },
    });
    if (!server || !server.wotEnabled || !server.referentePubkey) return;

    const fetchedAt = server.referenteFetchedAt?.getTime() ?? 0;
    if (Date.now() - fetchedAt < staleAfterMs) return;

    await refreshWot(serverId);
  } catch (err) {
    // Never block callers on background refresh failures.
    console.warn('maybeAutoRefreshWot failed for server', serverId, err);
  }
}
