import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { validateSlug, isInvitationDead } from '@/lib/invite-slug';

// GET /api/servers/:serverId/invite-aliases — list aliases (admin+).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const aliases = await prisma.inviteAlias.findMany({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ aliases });
}

// POST /api/servers/:serverId/invite-aliases — create alias (admin+).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const check = validateSlug(body.slug ?? '');
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }
  const { slug } = check;

  // Shared namespace with Invitation.code. Dead invitations (revoked/expired/
  // fully-used) don't resolve anymore, so we let aliases reclaim those slugs.
  const [existingAlias, existingInvite] = await Promise.all([
    prisma.inviteAlias.findUnique({ where: { slug } }),
    prisma.invitation.findUnique({ where: { code: slug } }),
  ]);
  if (existingAlias) {
    return NextResponse.json(
      { error: 'That slug is already in use' },
      { status: 409 }
    );
  }
  if (existingInvite && !isInvitationDead(existingInvite)) {
    return NextResponse.json(
      { error: 'That slug is currently an active invite code — revoke it first' },
      { status: 409 }
    );
  }

  const alias = await prisma.inviteAlias.create({
    data: {
      slug,
      serverId,
      createdBy: actor.pubkey,
      enabled: body.enabled === false ? false : true,
    },
  });

  return NextResponse.json({ alias }, { status: 201 });
}
