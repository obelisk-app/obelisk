import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getAuthorProfile } from '@/lib/profile-sync';
import { canWriteInChannel, getAuthMember } from '@/lib/auth-roles';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';
import { ServerToClient } from '@/lib/socket-events';

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
    select: { id: true, serverId: true, readPermission: true, readRoleIds: true, type: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.readPermission) {
    const access = await resolveMemberAccess(pubkey, channel.serverId);
    if (!canReadChannel(access.role, channel, access.customRoleIds)) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const around = searchParams.get('around');
  const postId = searchParams.get('postId');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  const isForum = channel.type === 'forum';
  // When loading a forum post thread, gather every descendant of the post via
  // BFS so that replies-to-replies (nested at any depth) are included. A flat
  // `replyToId: postId` filter would only return direct children and drop
  // nested replies from the thread view.
  let forumFilter: Record<string, unknown> = {};
  if (isForum) {
    if (postId) {
      const threadIds: string[] = [];
      let frontier: string[] = [postId];
      while (frontier.length > 0) {
        const next = await prisma.message.findMany({
          where: { channelId, replyToId: { in: frontier }, deletedAt: null },
          select: { id: true },
        });
        const newIds = next.map((n) => n.id).filter((id) => !threadIds.includes(id));
        if (newIds.length === 0) break;
        threadIds.push(...newIds);
        frontier = newIds;
      }
      forumFilter = { id: { in: threadIds } };
    } else {
      forumFilter = { title: { not: null } as const, replyToId: null };
    }
  }

  const include = {
    replyTo: {
      select: { id: true, content: true, authorPubkey: true },
    },
    reactions: {
      select: { id: true, messageId: true, authorPubkey: true, emoji: true },
    },
  } as const;

  // ?around=<msgId>: return a page centered on the target message so deep-links
  // to old messages (shared via "Copiar enlace") can land + highlight the target
  // even if it's not in the most recent page. Half before, half after + target.
  if (around) {
    const target = await prisma.message.findUnique({
      where: { id: around },
      select: { id: true, createdAt: true, channelId: true, deletedAt: true },
    });
    if (!target || target.channelId !== channelId || target.deletedAt) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    const half = Math.floor(limit / 2);
    const [before, after] = await Promise.all([
      prisma.message.findMany({
        where: { channelId, deletedAt: null, ...forumFilter, createdAt: { lt: target.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: half,
        include,
      }),
      prisma.message.findMany({
        where: { channelId, deletedAt: null, ...forumFilter, createdAt: { gt: target.createdAt } },
        orderBy: { createdAt: 'asc' },
        take: half,
        include,
      }),
    ]);
    const targetFull = await prisma.message.findUnique({
      where: { id: around },
      include,
    });
    const ordered = [...before.reverse(), ...(targetFull ? [targetFull] : []), ...after];
    const oldest = ordered[0]?.id ?? null;
    return NextResponse.json({
      messages: ordered,
      nextCursor: oldest,
    });
  }

  const messages = await prisma.message.findMany({
    where: { channelId, deletedAt: null, ...forumFilter },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include,
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
    select: {
      id: true,
      serverId: true,
      writePermission: true,
      writeRoleIds: true,
      readPermission: true,
      readRoleIds: true,
    },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  if (channel.readPermission) {
    const access = await resolveMemberAccess(pubkey, channel.serverId);
    if (!canReadChannel(access.role, channel, access.customRoleIds)) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }
  }

  // Check if user is banned
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: channel.serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json({ error: 'You are banned from this server' }, { status: 403 });
  }

  // Check if user is muted
  const mute = await prisma.mute.findFirst({
    where: { serverId: channel.serverId, targetPubkey: pubkey, expiresAt: { gt: new Date() } },
  });
  if (mute) {
    return NextResponse.json({ error: 'You are muted', mutedUntil: mute.expiresAt }, { status: 403 });
  }

  // Channel-level write permission (who-can-post). Resolves server-owner /
  // instance-owner to the 'owner' role so elevated callers always pass.
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
    include: {
      replyTo: {
        select: { id: true, content: true, authorPubkey: true },
      },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  // Bump "last seen" timestamp on the member row (best-effort).
  prisma.member
    .updateMany({
      where: { serverId: channel.serverId, pubkey },
      data: { lastActivityAt: new Date() },
    })
    .catch(() => {});

  // Attach author profile so real-time clients render immediately
  // without a separate fetch round-trip.
  const author = await getAuthorProfile(pubkey, channel.serverId);
  const enriched = { ...message, author };

  // Broadcast via Socket.io if available
  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, enriched);
  }

  return NextResponse.json(enriched, { status: 201 });
}

// PATCH /api/channels/:channelId/messages — edit a message
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { channelId } = await params;
  const { messageId, content } = await req.json();

  if (!messageId || typeof messageId !== 'string') {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }

  if (content.length > 4000) {
    return NextResponse.json({ error: 'Message too long (max 4000 chars)' }, { status: 400 });
  }

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { authorPubkey: true, channelId: true, deletedAt: true },
  });

  if (!existing || existing.deletedAt || existing.channelId !== channelId) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  if (existing.authorPubkey !== pubkey) {
    return NextResponse.json({ error: 'You can only edit your own messages' }, { status: 403 });
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { content: content.trim(), editedAt: new Date() },
    include: {
      replyTo: {
        select: { id: true, content: true, authorPubkey: true },
      },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit(ServerToClient.MessageEdited, updated);
  }

  return NextResponse.json(updated);
}
