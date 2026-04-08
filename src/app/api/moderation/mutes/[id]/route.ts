import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// DELETE /api/moderation/mutes/[id] — unmute a user (mod+)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const mute = await prisma.mute.findUnique({ where: { id } });
  if (!mute || mute.serverId !== serverId) {
    return NextResponse.json({ error: 'Mute not found' }, { status: 404 });
  }

  await prisma.mute.delete({ where: { id } });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: mute.targetPubkey,
      action: 'unmute',
    },
  });

  return NextResponse.json({ ok: true });
}
