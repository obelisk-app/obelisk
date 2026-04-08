import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// POST /api/admin/members/[pubkey]/ban — ban a user (admin+)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  if (pubkey === actor.pubkey) {
    return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 });
  }

  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerPubkey: true } });
  if (server?.ownerPubkey === pubkey) {
    return NextResponse.json({ error: 'Cannot ban the server owner' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  await prisma.ban.upsert({
    where: { serverId_pubkey: { serverId, pubkey } },
    create: { serverId, pubkey, bannedByPubkey: actor.pubkey, reason: body.reason },
    update: { bannedByPubkey: actor.pubkey, reason: body.reason },
  });

  // Also kick from server
  await prisma.member.deleteMany({ where: { serverId, pubkey } });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: pubkey,
      action: 'ban',
      reason: body.reason,
    },
  });

  // Force disconnect via Socket.io
  (globalThis as any).__disconnectPubkey?.(pubkey, 'You have been banned');
  (globalThis as any).__emitModEvent?.('member-banned', { pubkey });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/members/[pubkey]/ban — unban a user (admin+)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const deleted = await prisma.ban.deleteMany({ where: { serverId, pubkey } });
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Ban not found' }, { status: 404 });
  }

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: pubkey,
      action: 'unban',
    },
  });

  return NextResponse.json({ ok: true });
}
