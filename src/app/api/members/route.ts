import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { triggerBackgroundRefreshIfStale } from '@/lib/profile-sync';

// GET /api/members — list all members of the current server
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  // Opportunistic background refresh of stale profiles (>6h old or never
  // fetched). Non-blocking, rate-limited to 60s per server. This replaces
  // the manual "Refresh profiles" admin button for the common case.
  void triggerBackgroundRefreshIfStale(server.id, 6).catch(() => {});

  const members = await prisma.member.findMany({
    where: { serverId: server.id },
    select: {
      pubkey: true,
      role: true,
      displayName: true,
      picture: true,
      nip05: true,
      about: true,
      banner: true,
      lud16: true,
      website: true,
      nickname: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: 'asc' },
  });

  return NextResponse.json({ members });
}
