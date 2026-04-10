import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/channels/[channelId]/posts — list forum posts (top-level messages)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  if (channel.type !== 'forum') return NextResponse.json({ error: 'Not a forum channel' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  const posts = await prisma.message.findMany({
    where: { channelId, replyToId: null, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      _count: { select: { replies: true } },
      replies: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
      tags: {
        include: { tag: true },
      },
    },
  });

  const hasMore = posts.length > limit;
  if (hasMore) posts.pop();

  const result = posts.map((p) => ({
    id: p.id,
    channelId: p.channelId,
    authorPubkey: p.authorPubkey,
    title: p.title,
    content: p.content,
    createdAt: p.createdAt,
    replyCount: p._count.replies,
    lastReplyAt: p.replies[0]?.createdAt ?? null,
    tags: p.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  }));

  return NextResponse.json({ posts: result, hasMore });
}

// POST /api/channels/[channelId]/posts — create a forum post
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, type: true, serverId: true },
  });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  if (channel.type !== 'forum') return NextResponse.json({ error: 'Not a forum channel' }, { status: 400 });

  // Ban/mute check
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: channel.serverId, pubkey } },
  });
  if (ban) return NextResponse.json({ error: 'You are banned' }, { status: 403 });

  const mute = await prisma.mute.findFirst({
    where: { serverId: channel.serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
  });
  if (mute) return NextResponse.json({ error: 'You are muted', mutedUntil: mute.expiresAt }, { status: 403 });

  const { title, content, tagIds } = await req.json();
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  const post = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      title: title.trim(),
      content: content.trim(),
      ...(Array.isArray(tagIds) && tagIds.length > 0
        ? { tags: { create: tagIds.map((tagId: string) => ({ tagId })) } }
        : {}),
    },
    include: {
      tags: { include: { tag: true } },
    },
  });

  // Bump activity timestamp for invite-credit eligibility (best-effort).
  prisma.member
    .updateMany({
      where: { serverId: channel.serverId, pubkey },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => {});

  return NextResponse.json({
    ...post,
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  }, { status: 201 });
}
