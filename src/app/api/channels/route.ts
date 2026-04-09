import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/channels — list all channels grouped by category
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serverId = req.nextUrl.searchParams.get('serverId');
  const channelInclude = {
    orderBy: { position: 'asc' as const },
    include: { forumTags: { orderBy: { position: 'asc' as const } } },
  };
  const include = {
    categories: { orderBy: { position: 'asc' as const }, include: { channels: channelInclude } },
    channels: { where: { categoryId: null }, ...channelInclude },
  };
  const serverQuery = serverId
    ? prisma.server.findUnique({ where: { id: serverId }, include })
    : prisma.server.findFirst({ include });
  const server = await serverQuery;

  if (!server) {
    return NextResponse.json({ error: 'No server found' }, { status: 404 });
  }

  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      icon: server.icon,
      banner: server.banner,
    },
    pinnedChannels: server.channels,
    categories: server.categories,
  });
}

// POST /api/channels — create a new channel (admin+ only)
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { name, categoryId, type = 'text' } = await req.json();
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const channel = await prisma.channel.create({
    data: {
      serverId,
      categoryId: categoryId || null,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      type,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
