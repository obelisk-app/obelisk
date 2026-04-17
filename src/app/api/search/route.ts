import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseSearchQuery, buildSearchWhere } from '@/lib/search';

type SortMode = 'relevance' | 'newest' | 'oldest';

function parseSort(raw: string | null): SortMode {
  if (raw === 'relevance' || raw === 'oldest') return raw;
  return 'newest';
}

// GET /api/search?q=...&serverId=...&cursor=...&limit=25&sort=newest|oldest|relevance
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
  const sort = parseSort(searchParams.get('sort'));

  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  if (!serverId) {
    return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (!member) {
    return NextResponse.json({ error: 'Not a member of this server' }, { status: 403 });
  }

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
    memberLookup.set(m.pubkey.slice(0, 8), m.pubkey);
  }

  const channelLookup = new Map<string, string>();
  for (const c of channels) {
    channelLookup.set(c.name, c.id);
  }

  const channelNameMap = new Map<string, string>();
  for (const c of channels) {
    channelNameMap.set(c.id, c.name);
  }

  const parsed = parseSearchQuery(q);
  const where = buildSearchWhere(parsed, serverId, memberLookup, channelLookup);

  // 'relevance' still orders by createdAt desc at the SQL layer, then we
  // rerank in-memory by term frequency over the returned page.
  // TODO(relevance): move to tsvector for true relevance ranking.
  const orderBy: 'asc' | 'desc' = sort === 'oldest' ? 'asc' : 'desc';

  const messages = await prisma.message.findMany({
    where: where as any,
    orderBy: { createdAt: orderBy },
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

  let results = messages.map((msg) => ({
    ...msg,
    channelName: channelNameMap.get(msg.channelId) || 'unknown',
  }));

  if (sort === 'relevance' && parsed.text.length > 0) {
    const terms = parsed.text.map((t) => t.toLowerCase());
    const score = (content: string) => {
      const lower = content.toLowerCase();
      let s = 0;
      for (const term of terms) {
        if (!term) continue;
        let idx = 0;
        while ((idx = lower.indexOf(term, idx)) !== -1) {
          s++;
          idx += term.length;
        }
      }
      return s;
    };
    results = [...results].sort((a, b) => score(b.content) - score(a.content));
  }

  return NextResponse.json({
    results,
    nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
  });
}
