import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInstanceOwner } from '@/lib/instance-owner';

type AdminRole = 'owner' | 'admin' | 'mod';

interface AdminServer {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  ownerPubkey: string;
  /** Caller's effective role on this server (owner | admin | mod). */
  role: AdminRole;
  /** True if the caller has owner-level access via INSTANCE_OWNER_PUBKEY. */
  viaInstanceOwner: boolean;
}

/**
 * GET /api/admin/servers — list servers the caller can administer.
 *
 * Visibility rules:
 *   - Instance owner sees every server (with role: 'owner', viaInstanceOwner: true)
 *   - Otherwise the caller sees servers where they hold a Member row with
 *     role >= mod, OR where they are the per-server ownerPubkey.
 */
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const instanceOwner = isInstanceOwner(pubkey);

  if (instanceOwner) {
    const all = await prisma.server.findMany({
      select: {
        id: true,
        name: true,
        icon: true,
        banner: true,
        ownerPubkey: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const servers: AdminServer[] = all.map((s) => ({
      ...s,
      role: 'owner',
      viaInstanceOwner: true,
    }));

    return NextResponse.json({ servers, instanceOwner: true });
  }

  // Non-instance-owner: gather memberships + servers they own.
  const [memberships, owned] = await Promise.all([
    prisma.member.findMany({
      where: { pubkey, role: { in: ['owner', 'admin', 'mod'] } },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            icon: true,
            banner: true,
            ownerPubkey: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    }),
    prisma.server.findMany({
      where: { ownerPubkey: pubkey },
      select: {
        id: true,
        name: true,
        icon: true,
        banner: true,
        ownerPubkey: true,
        createdAt: true,
      },
    }),
  ]);

  // Merge: dedupe by id, prefer owner role from Server.ownerPubkey
  const byId = new Map<string, AdminServer & { createdAt: Date }>();
  for (const m of memberships) {
    const role: AdminRole =
      m.server.ownerPubkey === pubkey ? 'owner' : (m.role as AdminRole);
    byId.set(m.server.id, {
      ...m.server,
      role,
      viaInstanceOwner: false,
    });
  }
  for (const s of owned) {
    if (!byId.has(s.id)) {
      byId.set(s.id, { ...s, role: 'owner', viaInstanceOwner: false });
    }
  }

  // Stable order across both branches: oldest server first. Without this the
  // /admin redirect (which picks servers[0]) lands on whichever server happened
  // to come first in the merge — usually the wrong one.
  const servers: AdminServer[] = Array.from(byId.values())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(({ createdAt: _createdAt, ...rest }) => rest);

  return NextResponse.json({
    servers,
    instanceOwner: false,
  });
}
