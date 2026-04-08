import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId, type Role } from '@/lib/auth-roles';

// PATCH /api/admin/members/[pubkey]/role — change member role (owner only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const { pubkey } = await params;
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  const { role } = await req.json();
  const validRoles: Role[] = ['admin', 'mod', 'member'];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role. Must be admin, mod, or member' }, { status: 400 });
  }

  // Can't change own role
  if (pubkey === actor.pubkey) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const updated = await prisma.member.update({
    where: { serverId_pubkey: { serverId, pubkey } },
    data: { role },
  });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey: pubkey,
      action: 'role_change',
      metadata: JSON.stringify({ oldRole: member.role, newRole: role }),
    },
  });

  return NextResponse.json(updated);
}
