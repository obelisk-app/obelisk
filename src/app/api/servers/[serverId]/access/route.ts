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
      invitesPerUser: true,
      inviteExpiryHours: true,
      minDaysActive: true,
    },
  });

  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  return NextResponse.json(server);
}

// PATCH /api/servers/:serverId/access — update WoT and invite credit settings (owner only).
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

  // Invite credit policy fields
  if ('invitesPerUser' in body) {
    const v = Number(body.invitesPerUser);
    if (Number.isInteger(v) && v >= 0) data.invitesPerUser = v;
  }
  if ('inviteExpiryHours' in body) {
    const v = Number(body.inviteExpiryHours);
    if (Number.isInteger(v) && v > 0) data.inviteExpiryHours = v;
  }
  if ('minDaysActive' in body) {
    const v = Number(body.minDaysActive);
    if (Number.isInteger(v) && v >= 0) data.minDaysActive = v;
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
      invitesPerUser: true,
      inviteExpiryHours: true,
      minDaysActive: true,
    },
  });

  return NextResponse.json(server);
}
