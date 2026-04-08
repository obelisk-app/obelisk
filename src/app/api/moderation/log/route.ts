import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/moderation/log — moderation audit log (mod+)
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const cursor = req.nextUrl.searchParams.get('cursor');
  const actionType = req.nextUrl.searchParams.get('action');

  const actions = await prisma.moderationAction.findMany({
    where: {
      serverId,
      ...(actionType ? { action: actionType } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(actions);
}
