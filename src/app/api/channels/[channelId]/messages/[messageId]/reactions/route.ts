import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { ServerToClient } from '@/lib/socket-events';

// POST /api/channels/:channelId/messages/:messageId/reactions — toggle reaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; messageId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId, messageId } = await params;
  const { emoji } = await req.json();

  if (!emoji || typeof emoji !== 'string') {
    return NextResponse.json({ error: 'emoji required' }, { status: 400 });
  }

  // Validate message exists in this channel
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { channelId: true, deletedAt: true },
  });

  if (!message || message.deletedAt || message.channelId !== channelId) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  // Toggle: remove if exists, add if not
  const existing = await prisma.reaction.findUnique({
    where: { messageId_authorPubkey_emoji: { messageId, authorPubkey: pubkey, emoji } },
  });

  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.reaction.create({
      data: { messageId, authorPubkey: pubkey, emoji },
    });
  }

  // Fetch updated reactions
  const reactions = await prisma.reaction.findMany({
    where: { messageId },
    select: { id: true, messageId: true, authorPubkey: true, emoji: true },
  });

  // Broadcast via Socket.io
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit(ServerToClient.ReactionUpdated, { messageId, reactions });
  }

  return NextResponse.json({ reactions });
}
