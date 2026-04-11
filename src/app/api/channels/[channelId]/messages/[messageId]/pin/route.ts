import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { getAuthorProfile } from '@/lib/profile-sync';

// POST /api/channels/:channelId/messages/:messageId/pin — toggle pin (admin+)
//
// Pinning is an admin/owner action. Any authenticated admin or owner of the
// server that contains the channel may pin or unpin any (non-deleted) message
// in that channel. The endpoint is a toggle: calling it on an unpinned
// message pins it, and calling it on a pinned message unpins it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; messageId: string }> },
) {
  const { channelId, messageId } = await params;

  // Resolve the server that owns this channel so we can run the role guard.
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const actor = await requireRole(req, channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, deletedAt: true, pinnedAt: true },
  });
  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  const nowPinning = existing.pinnedAt === null;
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: nowPinning
      ? { pinnedAt: new Date(), pinnedByPubkey: actor.pubkey }
      : { pinnedAt: null, pinnedByPubkey: null },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  // Attach author profile so clients can render the pinned panel without
  // waiting for a separate profile fetch. Mirrors the other enriched emits.
  const author = await getAuthorProfile(updated.authorPubkey, channel.serverId);
  const enriched = { ...updated, author };

  // Broadcast so every connected client updates their pinned view live.
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit('message-pinned', enriched);
  }

  return NextResponse.json({ message: enriched, pinned: nowPinning });
}
