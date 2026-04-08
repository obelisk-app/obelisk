import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/channels — list all channels grouped by category
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = await prisma.server.findFirst({
    include: {
      categories: {
        orderBy: { position: 'asc' },
        include: {
          channels: { orderBy: { position: 'asc' } },
        },
      },
      channels: {
        where: { categoryId: null },
        orderBy: { position: 'asc' },
      },
    },
  });

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

// POST /api/channels — create a new channel
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { name, categoryId, type = 'text' } = await req.json();
  if (!name) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const channel = await prisma.channel.create({
    data: {
      serverId: server.id,
      categoryId: categoryId || null,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      type,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
