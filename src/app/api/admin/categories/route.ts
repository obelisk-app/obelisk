import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/admin/categories — list categories with channels + uncategorized channels
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

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

// POST /api/admin/categories — create a category
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

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
