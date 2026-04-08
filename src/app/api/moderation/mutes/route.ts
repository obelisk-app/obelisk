import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/moderation/mutes — list active mutes (mod+)
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const mutes = await prisma.mute.findMany({
    where: { serverId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(mutes);
}

// POST /api/moderation/mutes — mute a user (mod+)
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const { targetPubkey, duration, reason } = await req.json();
  if (!targetPubkey || !duration) {
    return NextResponse.json({ error: 'targetPubkey and duration (minutes) required' }, { status: 400 });
  }

  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { ownerPubkey: true } });
  if (server?.ownerPubkey === targetPubkey) {
    return NextResponse.json({ error: 'Cannot mute the server owner' }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + duration * 60_000);

  const mute = await prisma.mute.create({
    data: { serverId, targetPubkey, mutedByPubkey: actor.pubkey, expiresAt, reason },
  });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey,
      action: 'mute',
      reason,
      metadata: JSON.stringify({ duration, expiresAt }),
    },
  });

  return NextResponse.json(mute, { status: 201 });
}
