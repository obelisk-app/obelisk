import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// PATCH /api/moderation/reports/[id] — resolve or dismiss a report (mod+)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const { status } = await req.json();
  if (!['resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Status must be "resolved" or "dismissed"' }, { status: 400 });
  }

  const report = await prisma.report.findUnique({ where: { id } });
  if (!report || report.serverId !== serverId) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const updated = await prisma.report.update({
    where: { id },
    data: { status, resolvedAt: new Date(), resolvedByPubkey: actor.pubkey },
  });

  return NextResponse.json(updated);
}
