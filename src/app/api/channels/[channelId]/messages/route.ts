import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/channels/:channelId/messages?cursor=&limit=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;

  // Validate channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      replyTo: {
        select: { id: true, content: true, authorPubkey: true },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  // Reverse to chronological order. nextCursor is the oldest message for backward pagination.
  const reversed = messages.reverse();

  return NextResponse.json({
    messages: reversed,
    nextCursor: hasMore ? reversed[0]?.id : null,
  });
}

// POST /api/channels/:channelId/messages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const { content, replyToId } = await req.json();

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  if (content.length > 4000) {
    return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
  }

  // Validate channel exists
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  // Validate replyToId if provided
  if (replyToId) {
    const replyTarget = await prisma.message.findUnique({
      where: { id: replyToId },
      select: { channelId: true },
    });
    if (!replyTarget || replyTarget.channelId !== channelId) {
      return NextResponse.json({ error: 'Invalid replyToId' }, { status: 400 });
    }
  }

  const message = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      content: content.trim(),
      replyToId: replyToId || null,
    },
  });

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit('new-message', message);
  }

  return NextResponse.json(message, { status: 201 });
}
