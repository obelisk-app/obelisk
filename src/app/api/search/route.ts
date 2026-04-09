import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseSearchQuery, buildSearchWhere } from '@/lib/search';

// GET /api/search?q=...&serverId=...&cursor=...&limit=25
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const serverId = searchParams.get('serverId');
  const cursor = searchParams.get('cursor');
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  if (!serverId) {
    return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  }

  // Verify user is a member of this server
  const member = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (!member) {
    return NextResponse.json({ error: 'Not a member of this server' }, { status: 403 });
  }

  // Build lookup maps for from: and in: filters
  const [members, channels] = await Promise.all([
    prisma.member.findMany({
      where: { serverId },
      select: { pubkey: true, displayName: true },
    }),
    prisma.channel.findMany({
      where: { serverId },
      select: { id: true, name: true },
    }),
  ]);

  const memberLookup = new Map<string, string>();
  for (const m of members) {
    if (m.displayName) {
      memberLookup.set(m.displayName, m.pubkey);
    }
    // Also allow searching by pubkey prefix
    memberLookup.set(m.pubkey.slice(0, 8), m.pubkey);
  }

  const channelLookup = new Map<string, string>();
  for (const c of channels) {
    channelLookup.set(c.name, c.id);
  }

  // Channel name lookup for results
  const channelNameMap = new Map<string, string>();
  for (const c of channels) {
    channelNameMap.set(c.id, c.name);
  }

  const parsed = parseSearchQuery(q);
  const where = buildSearchWhere(parsed, serverId, memberLookup, channelLookup);

  const messages = await prisma.message.findMany({
    where: where as any,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      replyTo: {
        select: { id: true, content: true, authorPubkey: true },
      },
      reactions: {
        select: { id: true, messageId: true, authorPubkey: true, emoji: true },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  const results = messages.map((msg) => ({
    ...msg,
    channelName: channelNameMap.get(msg.channelId) || 'unknown',
  }));

  return NextResponse.json({
    results,
    nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
  });
}
