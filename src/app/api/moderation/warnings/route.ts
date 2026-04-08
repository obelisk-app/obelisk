import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';

// GET /api/moderation/warnings — list warnings (mod+)
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const targetPubkey = req.nextUrl.searchParams.get('pubkey');

  const warnings = await prisma.warning.findMany({
    where: { serverId, ...(targetPubkey ? { targetPubkey } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(warnings);
}

// POST /api/moderation/warnings — warn a user (mod+)
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const { targetPubkey, reason } = await req.json();
  if (!targetPubkey || !reason) {
    return NextResponse.json({ error: 'targetPubkey and reason required' }, { status: 400 });
  }

  const warning = await prisma.warning.create({
    data: { serverId, targetPubkey, issuedByPubkey: actor.pubkey, reason },
  });

  await prisma.moderationAction.create({
    data: {
      serverId,
      actorPubkey: actor.pubkey,
      targetPubkey,
      action: 'warn',
      reason,
    },
  });

  return NextResponse.json(warning, { status: 201 });
}
