import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { triggerBackgroundRefreshIfStale } from '@/lib/profile-sync';
import { botDef, botPubkey } from '@/lib/bots/registry';

// GET /api/members?serverId=... — list all members of the given server.
// If `serverId` is omitted, falls back to the first server (legacy behavior).
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serverIdParam = req.nextUrl.searchParams.get('serverId');
  const server = serverIdParam
    ? await prisma.server.findUnique({ where: { id: serverIdParam }, select: { id: true } })
    : await prisma.server.findFirst({ select: { id: true } });
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
      customRoles: {
        select: {
          role: { select: { id: true, name: true, color: true, icon: true, priority: true } },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const bots = await prisma.serverBot.findMany({
    where: { serverId: server.id, enabled: true },
    orderBy: { createdAt: 'asc' },
  });
  const botMembers = bots
    .map((b) => {
      const def = botDef(b.type);
      if (!def) return null;
      return {
        pubkey: botPubkey(b.id),
        role: 'bot',
        displayName: b.displayName ?? def.defaultName,
        picture: b.avatarUrl ?? def.defaultAvatar,
        nip05: null,
        about: null,
        banner: null,
        lud16: null,
        website: null,
        nickname: null,
        joinedAt: b.createdAt,
        customRoles: [],
        isBot: true,
        botType: b.type,
        statusText: b.lastValue ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ members: [...botMembers, ...members] });
}
