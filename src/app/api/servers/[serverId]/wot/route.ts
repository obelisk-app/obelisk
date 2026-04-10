import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-roles';
import { prisma } from '@/lib/db';

// GET /api/servers/:serverId/wot — list cached WoT entries (paginated, admin+)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const url = new URL(req.url);
  const search = url.searchParams.get('search')?.trim() || '';
  const take = Math.min(Number(url.searchParams.get('take') ?? 50), 200);
  const skip = Math.max(Number(url.searchParams.get('skip') ?? 0), 0);

  const where = {
    serverId,
    ...(search ? { pubkey: { contains: search } } : {}),
  };

  const [entries, total, server] = await Promise.all([
    prisma.wotEntry.findMany({
      where,
      orderBy: { addedAt: 'desc' },
      take,
      skip,
    }),
    prisma.wotEntry.count({ where }),
    prisma.server.findUnique({
      where: { id: serverId },
      select: { referentePubkey: true, referenteFetchedAt: true, wotEnabled: true },
    }),
  ]);

  return NextResponse.json({ entries, total, take, skip, server });
}
