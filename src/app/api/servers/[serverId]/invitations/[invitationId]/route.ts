import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';

const MEMBER_INCLUDE = {
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
} as const;

// DELETE /api/servers/:serverId/invitations/:invitationId — soft-revoke an
// invitation (admin+).
//
// Revocation is a soft-delete: we set `revokedAt` / `revokedBy` but keep the
// row and its `joinedViaInviteId` relations intact so the admin panel can
// still show who came in through this link historically. The redeem endpoint
// rejects revoked invites with 410 "Invitation revoked".
//
// Idempotent: revoking an already-revoked invite returns 200 with the
// existing state and does not overwrite the original revokedAt/revokedBy.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; invitationId: string }> }
) {
  const { serverId, invitationId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const existing = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: MEMBER_INCLUDE,
  });

  if (!existing || existing.serverId !== serverId) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  }

  // Already revoked — return current state, don't re-stamp.
  if (existing.revokedAt) {
    return NextResponse.json({ invitation: existing });
  }

  const invitation = await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      revokedAt: new Date(),
      revokedBy: actor.pubkey,
    },
    include: MEMBER_INCLUDE,
  });

  return NextResponse.json({ invitation });
}
