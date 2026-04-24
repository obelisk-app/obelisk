import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';
import { postWelcomeMessage } from '@/lib/welcome';

/**
 * Cross-server membership management — instance owner only.
 *
 * Lets the operator add or remove a given user (`pubkey`) from any server in
 * the instance. Useful for moving users between servers, granting access
 * without going through invites/WoT, or cleaning up.
 *
 *   GET    /api/admin/users/[pubkey]/memberships
 *           → returns every server in the instance with the user's current
 *             role (or null if not a member). Lets the UI render a checklist.
 *
 *   POST   /api/admin/users/[pubkey]/memberships
 *           body: { serverId: string, role?: 'admin' | 'mod' | 'member' }
 *           → upserts the Member row.
 *
 *   DELETE /api/admin/users/[pubkey]/memberships?serverId=...
 *           → removes the Member row. Refuses to delete the row of a server
 *             owner — must transfer ownership first.
 */

type MembershipRole = 'owner' | 'admin' | 'mod' | 'member';

const VALID_ASSIGNABLE_ROLES: MembershipRole[] = ['admin', 'mod', 'member'];

async function requireInstanceOwner(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isInstanceOwner(pubkey)) {
    return NextResponse.json(
      { error: 'Only the instance owner can edit cross-server memberships' },
      { status: 403 }
    );
  }
  return pubkey;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const guard = await requireInstanceOwner(req);
  if (guard instanceof NextResponse) return guard;

  const { pubkey } = await params;

  const [servers, memberships] = await Promise.all([
    prisma.server.findMany({
      select: { id: true, name: true, icon: true, ownerPubkey: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.member.findMany({
      where: { pubkey },
      select: { serverId: true, role: true, joinedAt: true },
    }),
  ]);

  const memberByServer = new Map(memberships.map((m) => [m.serverId, m]));

  return NextResponse.json({
    pubkey,
    servers: servers.map((s) => {
      const m = memberByServer.get(s.id);
      const isServerOwner = s.ownerPubkey === pubkey;
      return {
        id: s.id,
        name: s.name,
        icon: s.icon,
        // Effective role: server owner > stored member role > null
        role: isServerOwner ? 'owner' : (m?.role ?? null),
        isMember: !!m || isServerOwner,
        isServerOwner,
        joinedAt: m?.joinedAt ?? null,
      };
    }),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const guard = await requireInstanceOwner(req);
  if (guard instanceof NextResponse) return guard;

  const { pubkey } = await params;

  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    return NextResponse.json({ error: 'Invalid pubkey' }, { status: 400 });
  }

  const body = await parseJsonBody(req);
  const serverId: string | undefined = body.serverId;
  const requestedRole: MembershipRole = body.role ?? 'member';

  if (!serverId || typeof serverId !== 'string') {
    return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  }
  if (!VALID_ASSIGNABLE_ROLES.includes(requestedRole)) {
    return NextResponse.json(
      { error: `role must be one of: ${VALID_ASSIGNABLE_ROLES.join(', ')}` },
      { status: 400 }
    );
  }

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true, ownerPubkey: true },
  });
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  const existingBefore = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey: pubkey.toLowerCase() } },
    select: { pubkey: true },
  });

  const member = await prisma.member.upsert({
    where: { serverId_pubkey: { serverId, pubkey: pubkey.toLowerCase() } },
    update: { role: requestedRole },
    create: {
      serverId,
      pubkey: pubkey.toLowerCase(),
      role: requestedRole,
    },
  });

  if (!existingBefore) {
    void postWelcomeMessage(serverId, pubkey.toLowerCase()).catch((err) => {
      console.warn('[admin/memberships] postWelcomeMessage failed:', err);
    });
  }

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: guard,
      targetPubkey: pubkey.toLowerCase(),
      action: 'role_change',
      metadata: JSON.stringify({
        source: 'instance_owner_membership_editor',
        role: requestedRole,
      }),
    },
  });

  return NextResponse.json({
    serverId,
    pubkey: member.pubkey,
    role: member.role,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const guard = await requireInstanceOwner(req);
  if (guard instanceof NextResponse) return guard;

  const { pubkey } = await params;
  const serverId = new URL(req.url).searchParams.get('serverId');

  if (!serverId) {
    return NextResponse.json({ error: 'serverId query param required' }, { status: 400 });
  }

  // Refuse to remove the server owner — they need to transfer ownership first.
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { ownerPubkey: true },
  });
  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }
  if (server.ownerPubkey === pubkey.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          'Cannot remove the server owner. Transfer ownership first via /admin → Settings.',
      },
      { status: 409 }
    );
  }

  const deleted = await prisma.member.deleteMany({
    where: { serverId, pubkey: pubkey.toLowerCase() },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: guard,
      targetPubkey: pubkey.toLowerCase(),
      action: 'kick',
      metadata: JSON.stringify({ source: 'instance_owner_membership_editor' }),
    },
  });

  return NextResponse.json({ ok: true });
}
