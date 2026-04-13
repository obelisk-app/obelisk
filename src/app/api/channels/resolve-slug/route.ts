import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { canReadChannel } from '@/lib/roles';
import { resolveMemberAccess } from '@/lib/channel-access';

// GET /api/channels/resolve-slug?c=<slug>[&s=<serverIdOrSlug>]
//
// Resolves a short share-link (`/chat?c=<slug>`) to a concrete
// { serverId, channelId } pair so the chat page can navigate to it.
//
// Matching rules:
//  1) If `s` looks like a cuid, it's used directly; otherwise it's treated as
//     a server-name slug.
//  2) Slug comparison is done by lowercase/alphanumeric equality —
//     Channel.name is already `[a-z0-9_-]{2,32}`, so an exact lookup by
//     `name` is sufficient for channels; for servers we slugify `name`.
//  3) The endpoint only returns servers/channels the caller can actually
//     read (via `canReadChannel` + the caller's membership).
//  4) If multiple channels match the slug across the caller's servers, we
//     prefer a match inside `s` when provided; otherwise the first found.
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const channelSlug = (searchParams.get('c') || '').toLowerCase();
  const serverHint = searchParams.get('s') || null;
  const postIdParam = searchParams.get('p') || null;
  const messageIdParam = searchParams.get('m') || null;
  if (!channelSlug) {
    return NextResponse.json({ error: 'c required' }, { status: 400 });
  }

  const looksLikeId = (v: string) =>
    /^[a-z0-9]{20,32}$/i.test(v) && !v.includes('-');

  // All servers this user is a member of — the access surface for slug
  // resolution. Instance-owner bypass is handled via `resolveMemberAccess`
  // per channel below.
  const members = await prisma.member.findMany({
    where: { pubkey },
    select: { serverId: true, server: { select: { id: true, name: true } } },
  });

  const slugify = (input: string) =>
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  let preferredServerId: string | null = null;
  if (serverHint) {
    if (looksLikeId(serverHint)) {
      preferredServerId = serverHint;
    } else {
      const hint = serverHint.toLowerCase();
      const match = members.find(
        (m) => slugify(m.server.name) === hint || m.server.id === hint,
      );
      preferredServerId = match?.serverId ?? null;
    }
  }

  const candidateServerIds = preferredServerId
    ? [preferredServerId, ...members.map((m) => m.serverId).filter((id) => id !== preferredServerId)]
    : members.map((m) => m.serverId);

  // Channel.name is the slug. If slugify is ever applied client-side (e.g.
  // for display renames), a follow-up migration can add a dedicated slug
  // column; for now exact name match is correct and indexed.
  for (const serverId of candidateServerIds) {
    // Match both on exact name (fast path) and on slugify-equal name (handles
    // names with underscores, mixed case, or anything else slugify normalizes).
    const channels = await prisma.channel.findMany({
      where: { serverId },
      select: {
        id: true,
        serverId: true,
        name: true,
        readPermission: true,
        readRoleIds: true,
      },
    });
    const channel = channels.find(
      (c) => c.name === channelSlug || slugify(c.name) === channelSlug,
    );
    if (!channel) continue;
    if (channel.readPermission) {
      const access = await resolveMemberAccess(pubkey, channel.serverId);
      if (!canReadChannel(access.role, channel, access.customRoleIds)) {
        // Channel exists but caller can't read — render a greyed pill rather
        // than a 404, per the Discord-style "name visible, content locked"
        // decision in FORUM_PLAN.md.
        return NextResponse.json({
          serverId: channel.serverId,
          channelId: channel.id,
          channelName: channel.name,
          noAccess: true,
          postTitle: null,
          messageAuthorName: null,
        });
      }
    }

    let postTitle: string | null = null;
    if (postIdParam) {
      const post = await prisma.message.findFirst({
        where: { id: postIdParam, channelId: channel.id, deletedAt: null },
        select: { title: true },
      });
      postTitle = post?.title ?? null;
    }

    let messageAuthorName: string | null = null;
    if (messageIdParam) {
      const msg = await prisma.message.findFirst({
        where: { id: messageIdParam, channelId: channel.id, deletedAt: null },
        select: { authorPubkey: true },
      });
      if (msg) {
        const member = await prisma.member.findUnique({
          where: { serverId_pubkey: { serverId: channel.serverId, pubkey: msg.authorPubkey } },
          select: { displayName: true },
        });
        messageAuthorName = member?.displayName ?? msg.authorPubkey.slice(0, 8);
      }
    }

    return NextResponse.json({
      serverId: channel.serverId,
      channelId: channel.id,
      channelName: channel.name,
      noAccess: false,
      postTitle,
      messageAuthorName,
    });
  }

  return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
}
