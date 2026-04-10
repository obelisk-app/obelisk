import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

// GET /api/servers — list servers the user is a member of
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const memberships = await prisma.member.findMany({
    where: { pubkey },
    include: {
      server: {
        select: { id: true, name: true, icon: true, banner: true, ownerPubkey: true },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const servers = memberships.map((m) => m.server);
  return NextResponse.json({ servers });
}

// POST /api/servers — create a new server
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // The instance owner can always create servers. Otherwise the caller must
  // already own at least one server (anti-spam: stops random users from
  // spinning up servers but lets the operator hand out ownership).
  if (!isInstanceOwner(pubkey)) {
    const ownsAny = await prisma.server.findFirst({ where: { ownerPubkey: pubkey } });
    if (!ownsAny) {
      return NextResponse.json(
        { error: 'Only the instance owner or an existing server owner can create new servers' },
        { status: 403 }
      );
    }
  }

  const { name, icon } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const server = await prisma.server.create({
    data: {
      name: name.trim(),
      icon: icon || null,
      ownerPubkey: pubkey,
      members: {
        create: { pubkey, role: 'owner' },
      },
      channels: {
        create: [
          { name: 'bienvenida', type: 'text', position: 0 },
          { name: 'general', type: 'text', position: 1 },
        ],
      },
    },
    select: { id: true, name: true, icon: true, banner: true, ownerPubkey: true },
  });

  return NextResponse.json(server, { status: 201 });
}
