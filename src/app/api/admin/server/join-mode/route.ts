import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';

// PATCH /api/admin/server/join-mode?serverId=... — toggle join mode (owner only)
export async function PATCH(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

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
