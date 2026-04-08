import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// DELETE /api/moderation/messages/[id] — soft-delete a message (mod+)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  await prisma.message.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: message.authorPubkey,
      action: 'delete_message',
      metadata: JSON.stringify({ messageId: id, channelId: message.channelId }),
    },
  });

  // Emit to channel so clients remove the message
  (globalThis as any).__emitModEvent?.('message-deleted', {
    messageId: id,
    channelId: message.channelId,
  });

  return NextResponse.json({ ok: true });
}
