import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/admin/members — list all members (owner only)
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const result = await requireRole(req, serverId, 'admin');
  if (result instanceof NextResponse) return result;

  const members = await prisma.member.findMany({
    where: { serverId },
    orderBy: { joinedAt: 'desc' },
  });

  const bans = await prisma.ban.findMany({
    where: { serverId },
    select: { pubkey: true },
  });
  const bannedSet = new Set(bans.map((b) => b.pubkey));

  // Determine effective role (owner from Server.ownerPubkey)
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerPubkey: true } });

  return NextResponse.json(
    members.map((m) => ({
      ...m,
      role: server?.ownerPubkey === m.pubkey ? 'owner' : m.role,
      banned: bannedSet.has(m.pubkey),
    }))
  );
}
