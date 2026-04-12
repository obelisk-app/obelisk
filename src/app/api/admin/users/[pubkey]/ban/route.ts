import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

async function requireInstanceOwner(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isInstanceOwner(pubkey)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return pubkey;
}

/**
 * POST /api/admin/users/[pubkey]/ban — instance-wide ban. Creates a Ban row
 * on every server in the instance (skipping servers the user owns), deletes
 * their Member rows, revokes sessions, and force-disconnects them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const actor = await requireInstanceOwner(req);
  if (actor instanceof NextResponse) return actor;

  const { pubkey } = await params;
  if (pubkey === actor) {
    return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const reason: string | undefined = typeof body.reason === 'string' ? body.reason : undefined;

  const servers = await prisma.server.findMany({
    select: { id: true, ownerPubkey: true },
  });
  const banTargets = servers.filter((s) => s.ownerPubkey !== pubkey);

  await prisma.$transaction([
    ...banTargets.map((s) =>
      prisma.ban.upsert({
        where: { serverId_pubkey: { serverId: s.id, pubkey } },
        create: { serverId: s.id, pubkey, bannedByPubkey: actor, reason },
        update: { bannedByPubkey: actor, reason },
      })
    ),
    prisma.member.deleteMany({
      where: { pubkey, serverId: { in: banTargets.map((s) => s.id) } },
    }),
    prisma.session.deleteMany({ where: { pubkey } }),
    ...banTargets.map((s) =>
      prisma.moderationAction.create({
        data: {
          serverId: s.id,
          actorPubkey: actor,
          targetPubkey: pubkey,
          action: 'ban',
          reason,
        },
      })
    ),
  ]);

  (globalThis as any).__disconnectPubkey?.(pubkey, 'You have been banned');
  for (const s of banTargets) {
    (globalThis as any).__emitModEvent?.('member-banned', { pubkey, serverId: s.id });
  }

  return NextResponse.json({
    ok: true,
    bannedFrom: banTargets.length,
    skippedOwnedServers: servers.length - banTargets.length,
  });
}

/**
 * DELETE /api/admin/users/[pubkey]/ban — lift every ban for this pubkey
 * across the instance.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const actor = await requireInstanceOwner(req);
  if (actor instanceof NextResponse) return actor;

  const { pubkey } = await params;

  const bans = await prisma.ban.findMany({
    where: { pubkey },
    select: { serverId: true },
  });

  await prisma.$transaction([
    prisma.ban.deleteMany({ where: { pubkey } }),
    ...bans.map((b) =>
      prisma.moderationAction.create({
        data: {
          serverId: b.serverId,
          actorPubkey: actor,
          targetPubkey: pubkey,
          action: 'unban',
        },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, liftedFrom: bans.length });
}
