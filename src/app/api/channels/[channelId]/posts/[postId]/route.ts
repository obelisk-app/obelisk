import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/channels/[channelId]/posts/[postId] — get a forum post with replies
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, postId } = await params;

  const post = await prisma.message.findUnique({
    where: { id: postId },
    select: {
      id: true, channelId: true, authorPubkey: true, title: true,
      content: true, createdAt: true, deletedAt: true,
    },
  });

  if (!post || post.channelId !== channelId || post.deletedAt) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const replies = await prisma.message.findMany({
    where: { replyToId: postId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = replies.length > limit;
  if (hasMore) replies.pop();

  return NextResponse.json({
    post: {
      id: post.id,
      channelId: post.channelId,
      authorPubkey: post.authorPubkey,
      title: post.title,
      content: post.content,
      createdAt: post.createdAt,
    },
    replies,
    hasMore,
  });
}

// POST /api/channels/[channelId]/posts/[postId] — reply to a forum post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string; postId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId, postId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  // Verify post exists
  const post = await prisma.message.findUnique({ where: { id: postId }, select: { id: true, channelId: true } });
  if (!post || post.channelId !== channelId) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  // Ban/mute check
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: channel.serverId, pubkey } },
  });
  if (ban) return NextResponse.json({ error: 'You are banned' }, { status: 403 });

  const mute = await prisma.mute.findFirst({
    where: { serverId: channel.serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
  });
  if (mute) return NextResponse.json({ error: 'You are muted', mutedUntil: mute.expiresAt }, { status: 403 });

  const { content } = await req.json();
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const reply = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      content: content.trim(),
      replyToId: postId,
    },
  });

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit('new-message', reply);
  }

  return NextResponse.json(reply, { status: 201 });
}
