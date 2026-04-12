import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

/**
 * GET /api/admin/users — instance owner only. Returns every distinct pubkey
 * known to the platform, aggregated across all servers plus any session-only
 * users that haven't joined a server yet. Profile data is best-effort from
 * the most recently updated Member row for that pubkey.
 */
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isInstanceOwner(pubkey)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [members, sessions, bans] = await Promise.all([
    prisma.member.findMany({
      select: {
        pubkey: true,
        displayName: true,
        picture: true,
        nip05: true,
        joinedAt: true,
        profileUpdatedAt: true,
      },
      orderBy: { profileUpdatedAt: 'desc' },
    }),
    prisma.session.findMany({
      distinct: ['pubkey'],
      select: { pubkey: true, createdAt: true },
    }),
    prisma.ban.groupBy({
      by: ['pubkey'],
      _count: { _all: true },
    }),
  ]);

  const banCountByPk = new Map<string, number>(
    bans.map((b) => [b.pubkey, b._count._all])
  );

  interface UserRow {
    pubkey: string;
    displayName: string | null;
    picture: string | null;
    nip05: string | null;
    serverCount: number;
    bannedCount: number;
    firstSeen: string;
    lastSeen: string;
  }

  const byPk = new Map<string, UserRow>();

  for (const m of members) {
    const joined = m.joinedAt.toISOString();
    const existing = byPk.get(m.pubkey);
    if (!existing) {
      byPk.set(m.pubkey, {
        pubkey: m.pubkey,
        displayName: m.displayName,
        picture: m.picture,
        nip05: m.nip05,
        serverCount: 1,
        bannedCount: 0,
        firstSeen: joined,
        lastSeen: joined,
      });
    } else {
      existing.serverCount += 1;
      existing.displayName = existing.displayName ?? m.displayName;
      existing.picture = existing.picture ?? m.picture;
      existing.nip05 = existing.nip05 ?? m.nip05;
      if (joined < existing.firstSeen) existing.firstSeen = joined;
      if (joined > existing.lastSeen) existing.lastSeen = joined;
    }
  }

  for (const s of sessions) {
    if (byPk.has(s.pubkey)) continue;
    const ts = s.createdAt.toISOString();
    byPk.set(s.pubkey, {
      pubkey: s.pubkey,
      displayName: null,
      picture: null,
      nip05: null,
      serverCount: 0,
      bannedCount: 0,
      firstSeen: ts,
      lastSeen: ts,
    });
  }

  // Include ban-only users (banned then kicked, no Member/Session left).
  for (const [pk, count] of banCountByPk) {
    if (!byPk.has(pk)) {
      byPk.set(pk, {
        pubkey: pk,
        displayName: null,
        picture: null,
        nip05: null,
        serverCount: 0,
        bannedCount: count,
        firstSeen: new Date(0).toISOString(),
        lastSeen: new Date(0).toISOString(),
      });
    }
  }
  for (const u of byPk.values()) {
    u.bannedCount = banCountByPk.get(u.pubkey) ?? 0;
  }

  const users = Array.from(byPk.values()).sort((a, b) =>
    b.lastSeen.localeCompare(a.lastSeen)
  );

  return NextResponse.json({ users });
}
