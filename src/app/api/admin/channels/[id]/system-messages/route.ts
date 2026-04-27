import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { getAuthorProfile, SYSTEM_PUBKEY } from '@/lib/profile-sync';
import { ServerToClient } from '@/lib/socket-events';

// Admin-only endpoints for "post as the server" content.
//
// These let server admins/owners create channel welcome messages, forum
// indices, announcements, etc. authored by the synthetic server identity
// (SYSTEM_PUBKEY) rather than their own npub. `getAuthorProfile` already
// returns a profile derived from `Server.name` + `Server.icon` for the
// system pubkey, so no Member row is needed — the chat UI automatically
// renders system-authored content wearing the server's own face.
//
// Kept under `/api/admin/*` so the public POST routes can keep their
// invariant (`authorPubkey = caller.pubkey`, always) and so ban/mute checks
// don't have to grow a system-message escape hatch.

const MAX_CONTENT = 4000;
const MAX_TITLE = 200;

// GET /api/admin/channels/[channelId]/system-messages — list every
// system-authored item (text message OR forum post) still alive in this
// channel. Used by the admin "Content" tab to render the edit/delete list.
// Returns full replies+tags+author so the UI can render without a second
// round-trip per row.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true, type: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const actor = await requireRole(req, channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const messages = await prisma.message.findMany({
    where: {
      channelId,
      authorPubkey: SYSTEM_PUBKEY,
      deletedAt: null,
      replyToId: null,
    },
    orderBy: { createdAt: 'desc' },
    include: {
      tags: { include: { tag: true } },
    },
  });

  const author = await getAuthorProfile(SYSTEM_PUBKEY, channel.serverId);

  return NextResponse.json({
    channel: { id: channel.id, type: channel.type },
    author,
    messages: messages.map((m) => ({
      id: m.id,
      channelId: m.channelId,
      authorPubkey: m.authorPubkey,
      title: m.title,
      content: m.content,
      createdAt: m.createdAt,
      editedAt: m.editedAt,
      pinnedAt: m.pinnedAt,
      pinnedByPubkey: m.pinnedByPubkey,
      tags: m.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    })),
  });
}

// POST /api/admin/channels/[channelId]/system-messages — create a
// system-authored message (text channel) or forum post (forum channel).
//
// Body:
//   { content: string, title?: string, tagIds?: string[], pin?: boolean }
//
// - `content` always required.
// - `title` required for forum channels, rejected for text channels.
// - `tagIds` only valid for forum channels; tags must belong to this channel.
// - `pin` only valid for text channels; when true, the message is created
//   already pinned and `message-pinned` is emitted alongside `new-message`.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: channelId } = await params;

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, serverId: true, type: true },
  });
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
  }

  const actor = await requireRole(req, channel.serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  if (channel.type !== 'text' && channel.type !== 'forum') {
    return NextResponse.json(
      { error: 'System messages can only be posted to text or forum channels' },
      { status: 400 },
    );
  }

  const body = await parseJsonBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const tagIds: string[] = Array.isArray(body?.tagIds)
    ? body.tagIds.filter((x: unknown) => typeof x === 'string')
    : [];
  const pin = body?.pin === true;

  if (!content) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ error: `Content too long (max ${MAX_CONTENT})` }, { status: 400 });
  }

  if (channel.type === 'forum') {
    if (!title) {
      return NextResponse.json({ error: 'Title required for forum posts' }, { status: 400 });
    }
    if (title.length > MAX_TITLE) {
      return NextResponse.json({ error: `Title too long (max ${MAX_TITLE})` }, { status: 400 });
    }
    if (pin) {
      return NextResponse.json({ error: 'Pinning forum posts is not supported' }, { status: 400 });
    }
    if (tagIds.length > 0) {
      const validTags = await prisma.forumTag.findMany({
        where: { channelId, id: { in: tagIds } },
        select: { id: true },
      });
      if (validTags.length !== tagIds.length) {
        return NextResponse.json({ error: 'One or more tagIds do not belong to this channel' }, { status: 400 });
      }
    }
  } else {
    // text channel
    if (title) {
      return NextResponse.json({ error: 'Title not allowed on text channels' }, { status: 400 });
    }
    if (tagIds.length > 0) {
      return NextResponse.json({ error: 'Tags not allowed on text channels' }, { status: 400 });
    }
  }

  const now = new Date();
  const created = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: SYSTEM_PUBKEY,
      content,
      ...(channel.type === 'forum' ? { title } : {}),
      ...(pin ? { pinnedAt: now, pinnedByPubkey: actor.pubkey } : {}),
      ...(tagIds.length > 0
        ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } }
        : {}),
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
      tags: { include: { tag: true } },
    },
  });

  // Attach server-identity profile so clients render with the server's
  // name + icon immediately, without a second fetch. Mirrors every other
  // `new-message` emit site.
  const author = await getAuthorProfile(SYSTEM_PUBKEY, channel.serverId);
  const enriched = {
    ...created,
    author,
    tags: created.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
  };

  const io = (globalThis as any).__io;
  if (io) {
    io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, enriched);
    if (pin) {
      io.to(`channel:${channelId}`).emit(ServerToClient.MessagePinned, enriched);
    }
  }

  return NextResponse.json(enriched, { status: 201 });
}
