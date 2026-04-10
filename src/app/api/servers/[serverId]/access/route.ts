import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-roles';
import { prisma } from '@/lib/db';

// GET /api/servers/:serverId/access — read current access config (admin+)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      referentePubkey: true,
      wotEnabled: true,
      referenteFetchedAt: true,
      joinMode: true,
    },
  });

  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  return NextResponse.json(server);
}

// PATCH /api/servers/:serverId/access — update WoT settings (owner only).
//
// The activity-based invite-credit policy fields (minDaysActive, minMessages,
// invitesPerUser, inviteExpiryHours) were removed from this endpoint when the
// invite-credits feature was retired. The columns still exist in the schema
// (additive removal would lose data) but they are no longer read or written.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if ('referentePubkey' in body) {
    const v = body.referentePubkey;
    if (v === null || v === '') data.referentePubkey = null;
    else if (typeof v === 'string') data.referentePubkey = v;
  }
  if ('wotEnabled' in body && typeof body.wotEnabled === 'boolean') {
    data.wotEnabled = body.wotEnabled;
  }

  // Reset cache timestamp when referente changes so the next refresh re-fetches.
  if ('referentePubkey' in data) {
    data.referenteFetchedAt = null;
  }

  const server = await prisma.server.update({
    where: { id: serverId },
    data,
    select: {
      referentePubkey: true,
      wotEnabled: true,
      referenteFetchedAt: true,
    },
  });

  return NextResponse.json(server);
}
