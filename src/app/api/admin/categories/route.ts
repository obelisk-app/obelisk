import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';

// GET /api/admin/categories?serverId=... — list categories with channels + uncategorized channels
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const [categories, uncategorizedChannels] = await Promise.all([
    prisma.category.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
      include: {
        channels: { orderBy: { position: 'asc' } },
      },
    }),
    prisma.channel.findMany({
      where: { serverId, categoryId: null },
      orderBy: { position: 'asc' },
    }),
  ]);

  return NextResponse.json({ categories, uncategorizedChannels });
}

// POST /api/admin/categories?serverId=... — create a category
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const { name, position } = await req.json();
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name required' }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      serverId,
      name: name.trim(),
      position: position ?? 0,
    },
  });

  return NextResponse.json(category, { status: 201 });
}
