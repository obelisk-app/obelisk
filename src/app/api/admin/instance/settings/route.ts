import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

// GET /api/admin/instance/settings — fetch the global settings
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey || !isInstanceOwner(pubkey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  let settings = await prisma.instanceSettings.findUnique({
    where: { id: 'global' },
    include: { defaultServer: { select: { id: true, name: true } } },
  });

  if (!settings) {
    settings = await prisma.instanceSettings.create({
      data: { id: 'global' },
      include: { defaultServer: { select: { id: true, name: true } } },
    });
  }

  return NextResponse.json({ settings });
}

// PUT /api/admin/instance/settings — update the global settings
export async function PUT(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey || !isInstanceOwner(pubkey)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { defaultServerId } = await req.json();

  if (defaultServerId !== undefined && defaultServerId !== null) {
    // Validate that the server exists
    const server = await prisma.server.findUnique({ where: { id: defaultServerId } });
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }
  }

  const settings = await prisma.instanceSettings.upsert({
    where: { id: 'global' },
    update: { defaultServerId: defaultServerId || null },
    create: { id: 'global', defaultServerId: defaultServerId || null },
    include: { defaultServer: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ settings });
}
