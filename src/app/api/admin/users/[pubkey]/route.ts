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
 * DELETE /api/admin/users/[pubkey] — instance owner only. Hard-deletes the
 * user from the database: every Member row across every server, plus all
 * Session rows. Bans and moderation logs are preserved.
 *
 * Refuses to remove a user who owns any server — transfer ownership first.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const actor = await requireInstanceOwner(req);
  if (actor instanceof NextResponse) return actor;

  const { pubkey } = await params;

  if (pubkey === actor) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
  }

  const ownedServers = await prisma.server.findMany({
    where: { ownerPubkey: pubkey },
    select: { id: true, name: true },
  });
  if (ownedServers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot remove: user owns ${ownedServers.length} server(s). Transfer ownership first.`,
        servers: ownedServers,
      },
      { status: 409 }
    );
  }

  const [members, sessions] = await prisma.$transaction([
    prisma.member.deleteMany({ where: { pubkey } }),
    prisma.session.deleteMany({ where: { pubkey } }),
  ]);

  // Drop any live socket sessions for this pubkey.
  (globalThis as any).__disconnectPubkey?.(pubkey, 'Your account was removed');

  return NextResponse.json({
    ok: true,
    removedMembers: members.count,
    removedSessions: sessions.count,
  });
}
