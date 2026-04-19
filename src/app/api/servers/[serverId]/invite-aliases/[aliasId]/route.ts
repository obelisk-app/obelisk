import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-roles';
import { validateSlug, isInvitationDead } from '@/lib/invite-slug';

// PATCH /api/servers/:serverId/invite-aliases/:aliasId — rename / toggle.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; aliasId: string }> }
) {
  const { serverId, aliasId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const alias = await prisma.inviteAlias.findUnique({ where: { id: aliasId } });
  if (!alias || alias.serverId !== serverId) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { slug?: string; enabled?: boolean } = {};

  if (typeof body.slug === 'string' && body.slug.trim() !== alias.slug) {
    const check = validateSlug(body.slug);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const nextSlug = check.slug;
    const [clashAlias, clashInvite] = await Promise.all([
      prisma.inviteAlias.findUnique({ where: { slug: nextSlug } }),
      prisma.invitation.findUnique({ where: { code: nextSlug } }),
    ]);
    if (clashAlias && clashAlias.id !== alias.id) {
      return NextResponse.json(
        { error: 'That slug is already in use' },
        { status: 409 }
      );
    }
    if (clashInvite && !isInvitationDead(clashInvite)) {
      return NextResponse.json(
        { error: 'That slug is currently an active invite code — revoke it first' },
        { status: 409 }
      );
    }
    data.slug = nextSlug;
  }

  if (typeof body.enabled === 'boolean') {
    data.enabled = body.enabled;
  }

  const updated = await prisma.inviteAlias.update({
    where: { id: aliasId },
    data,
  });
  return NextResponse.json({ alias: updated });
}

// DELETE /api/servers/:serverId/invite-aliases/:aliasId — delete alias.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string; aliasId: string }> }
) {
  const { serverId, aliasId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const alias = await prisma.inviteAlias.findUnique({ where: { id: aliasId } });
  if (!alias || alias.serverId !== serverId) {
    return NextResponse.json({ error: 'Alias not found' }, { status: 404 });
  }

  await prisma.inviteAlias.delete({ where: { id: aliasId } });
  return NextResponse.json({ ok: true });
}
