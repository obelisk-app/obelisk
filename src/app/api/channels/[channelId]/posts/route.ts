import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { canWriteInChannel, getAuthMember } from '@/lib/auth-roles';
import { resolveForumTagIds } from '@/lib/forum-tags';
import { fanOutMentions, fanOutChannelUnread } from '@/lib/mention-fanout';

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
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
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
    coverImage: p.coverImage,
    content: p.content,
    createdAt: p.createdAt,
    replyCount: p._count.replies,
    lastReplyAt: p.replies[0]?.createdAt ?? null,
    tags: p.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    reactions: p.reactions,
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
    select: {
      id: true,
      name: true,
      type: true,
      serverId: true,
      writePermission: true,
      writeRoleIds: true,
      readPermission: true,
      readRoleIds: true,
    },
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

  // Channel-level write permission
  if (channel.writePermission) {
    const authMember = await getAuthMember(req, channel.serverId);
    const role = authMember?.role ?? 'member';
    let memberCustomRoleIds: string[] = [];
    if (channel.writePermission === 'roles' && authMember?.id) {
      const links = await prisma.memberCustomRole.findMany({
        where: { memberId: authMember.id },
        select: { roleId: true },
      });
      memberCustomRoleIds = links.map((l) => l.roleId);
    }
    if (
      !canWriteInChannel(
        role,
        { writePermission: channel.writePermission, writeRoleIds: channel.writeRoleIds },
        memberCustomRoleIds
      )
    ) {
      return NextResponse.json({ error: 'channel_write_locked' }, { status: 403 });
    }
  }

  const { title, content, tagIds, tagNames, coverImage } = await req.json();
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title required' }, { status: 400 });
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }
  const coverImageClean = typeof coverImage === 'string' && coverImage.trim()
    ? coverImage.trim()
    : null;

  const resolvedTagIds = await resolveForumTagIds(channelId, tagIds, tagNames);

  const post = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      title: title.trim(),
      coverImage: coverImageClean,
      content: content.trim(),
      ...(resolvedTagIds.length > 0
        ? { tags: { create: resolvedTagIds.map((tagId) => ({ tagId })) } }
        : {}),
    },
    include: {
      tags: { include: { tag: true } },
    },
  });

  // Bump "last seen" timestamp on the member row (best-effort).
  prisma.member
    .updateMany({
      where: { serverId: channel.serverId, pubkey },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => {});

  // Broadcast + mention fan-out. Mentions in a forum post's title or body
  // must reach the mentioned user regardless of subscription (which can't
  // exist yet for a brand-new post). Per-user muting is a roadmap feature,
  // not a default gate — see memory `feedback_mentions_unconditional`.
  const io = (globalThis as any).__io;
  if (io) {
    const scanContent = `${post.title ?? ''}\n${post.content}`;
    let mentionedPubkeys = new Set<string>();
    try {
      const result = await fanOutMentions({
        prisma,
        io,
        messageId: post.id,
        channelId,
        serverId: channel.serverId,
        authorPubkey: pubkey,
        content: scanContent,
        postId: post.id,
        postMeta: {
          title: post.title ?? '',
          channelName: channel.name,
        },
        channel: {
          readPermission: channel.readPermission,
          readRoleIds: channel.readRoleIds,
        },
        createdAt: post.createdAt,
      });
      mentionedPubkeys = new Set(result.mentionedPubkeys);
    } catch (err) {
      console.error('[posts POST] mention fan-out failed', err);
    }

    try {
      await fanOutChannelUnread({
        prisma,
        io,
        channelId,
        serverId: channel.serverId,
        authorPubkey: pubkey,
        content: scanContent,
        mentionedPubkeys,
        channel: {
          readPermission: channel.readPermission,
          readRoleIds: channel.readRoleIds,
        },
      });
    } catch (err) {
      console.error('[posts POST] channel unread fan-out failed', err);
    }
  }

  return NextResponse.json({
    ...post,
    tags: post.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  }, { status: 201 });
}
