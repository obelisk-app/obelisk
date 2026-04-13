import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { requireRole } from '@/lib/auth-roles';
import { resolveMemberAccess } from '@/lib/channel-access';
import { canReadChannel } from '@/lib/roles';

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

  const access = await resolveMemberAccess(pubkey, server.id);
  const visible = (ch: { readPermission: string | null; readRoleIds: string[] }) =>
    canReadChannel(access.role, ch, access.customRoleIds);

  const pinnedChannels = server.channels.filter(visible);
  const categories = server.categories.map((cat) => ({
    ...cat,
    channels: cat.channels.filter(visible),
  }));

  return NextResponse.json({
    server: {
      id: server.id,
      name: server.name,
      icon: server.icon,
      banner: server.banner,
    },
    pinnedChannels,
    categories,
  });
}

// POST /api/channels — create a new channel (admin+ only). Body must include serverId.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, categoryId, type = 'text', serverId } = body;

  if (!serverId || typeof serverId !== 'string') {
    return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

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
