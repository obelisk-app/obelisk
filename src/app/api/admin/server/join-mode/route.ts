import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// PATCH /api/admin/server/join-mode — toggle join mode (owner only)
export async function PATCH(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  const { joinMode } = await req.json();
  if (!['open', 'invite-only'].includes(joinMode)) {
    return NextResponse.json({ error: 'joinMode must be "open" or "invite-only"' }, { status: 400 });
  }

  const updated = await prisma.server.update({
    where: { id: serverId },
    data: { joinMode },
  });

  return NextResponse.json({ joinMode: updated.joinMode });
}
