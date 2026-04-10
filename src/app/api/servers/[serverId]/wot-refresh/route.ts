import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-roles';
import { refreshWot } from '@/lib/wot';

// POST /api/servers/:serverId/wot-refresh — force refresh the cached WoT (admin+)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  try {
    const result = await refreshWot(serverId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refresh failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
