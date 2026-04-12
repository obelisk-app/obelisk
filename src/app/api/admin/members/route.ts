import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';
import { triggerBackgroundRefreshIfStale } from '@/lib/profile-sync';

// GET /api/admin/members?serverId=... — list members and banned users of a server (admin+)
//
// The ban handler deletes the Member row, so banned users do NOT appear in the
// `Member` table. To still show them in the admin UI we hydrate stub rows from
// the `Ban` table for any banned pubkey that has no corresponding Member.
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const result = await requireRole(req, serverId, 'admin');
  if (result instanceof NextResponse) return result;

  // Opportunistic background refresh of stale profiles (non-blocking,
  // rate-limited). See src/lib/profile-sync.ts.
  void triggerBackgroundRefreshIfStale(serverId, 6).catch(() => {});

  const [members, bans, server] = await Promise.all([
    prisma.member.findMany({
      where: { serverId },
      orderBy: { joinedAt: 'desc' },
      include: {
        joinedViaInvite: {
          select: { id: true, code: true, createdBy: true },
        },
        customRoles: {
          include: {
            role: { select: { id: true, name: true, color: true, icon: true, priority: true } },
          },
        },
      },
    }),
    prisma.ban.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      select: {
        pubkey: true,
        reason: true,
        bannedByPubkey: true,
        createdAt: true,
      },
    }),
    prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerPubkey: true },
    }),
  ]);

  const banByPubkey = new Map(bans.map((b) => [b.pubkey, b]));

  const memberRows = members.map((m) => {
    const ban = banByPubkey.get(m.pubkey);
    return {
      ...m,
      role: server?.ownerPubkey === m.pubkey ? 'owner' : m.role,
      banned: !!ban,
      banReason: ban?.reason ?? null,
    };
  });

  // Hydrate stub rows for banned pubkeys with no Member row (the common case
  // since ban deletes the Member). Best-effort enrich with cached profile data
  // from any other server they're on.
  const memberPubkeys = new Set(members.map((m) => m.pubkey));
  const orphanedBans = bans.filter((b) => !memberPubkeys.has(b.pubkey));

  let profileByPubkey = new Map<string, { displayName: string | null; picture: string | null; nip05: string | null }>();
  if (orphanedBans.length > 0) {
    const profiles = await prisma.member.findMany({
      where: { pubkey: { in: orphanedBans.map((b) => b.pubkey) } },
      select: { pubkey: true, displayName: true, picture: true, nip05: true },
      distinct: ['pubkey'],
    });
    profileByPubkey = new Map(profiles.map((p) => [p.pubkey, p]));
  }

  const bannedRows = orphanedBans.map((b) => {
    const profile = profileByPubkey.get(b.pubkey);
    return {
      id: `ban-${b.pubkey}`,
      serverId,
      pubkey: b.pubkey,
      role: 'member' as const,
      displayName: profile?.displayName ?? null,
      picture: profile?.picture ?? null,
      nip05: profile?.nip05 ?? null,
      joinedAt: b.createdAt.toISOString(),
      banned: true,
      banReason: b.reason,
      joinedViaInvite: null,
    };
  });

  return NextResponse.json([...memberRows, ...bannedRows]);
}
