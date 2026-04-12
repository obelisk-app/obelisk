import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { getRemainingCredits } from '@/lib/invite-credits';

// GET /api/servers/:serverId/my-invites — member's own invite status & list.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'member');
  if (actor instanceof NextResponse) return actor;

  const [credits, invites] = await Promise.all([
    getRemainingCredits(serverId, actor.pubkey),
    prisma.invitation.findMany({
      where: { serverId, createdBy: actor.pubkey, memberCreated: true },
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          select: {
            id: true,
            pubkey: true,
            displayName: true,
            picture: true,
            nip05: true,
            joinedAt: true,
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    }),
  ]);

  return NextResponse.json({
    ...credits,
    invites,
  });
}
