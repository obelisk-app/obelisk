import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';

// POST /api/admin/members/[pubkey]/kick?serverId=... — kick a member (admin+)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  if (pubkey === actor.pubkey) {
    return NextResponse.json({ error: 'Cannot kick yourself' }, { status: 400 });
  }

  // Check target exists and is lower rank
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerPubkey: true } });
  if (server?.ownerPubkey === pubkey) {
    return NextResponse.json({ error: 'Cannot kick the server owner' }, { status: 403 });
  }

  const deleted = await prisma.member.deleteMany({
    where: { serverId, pubkey },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: pubkey,
      action: 'kick',
    },
  });

  // Force disconnect via Socket.io
  (globalThis as any).__disconnectPubkey?.(pubkey, 'You have been kicked');
  (globalThis as any).__emitModEvent?.('member-kicked', { pubkey });

  return NextResponse.json({ ok: true });
}
