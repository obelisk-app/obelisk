import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-roles';
import { prisma } from '@/lib/db';

// GET /api/servers/:serverId/wot/overrides — list overrides (admin+)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const overrides = await prisma.wotOverride.findMany({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ overrides });
}

// POST /api/servers/:serverId/wot/overrides — add an override (admin+)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const { pubkey, reason } = body as { pubkey?: string; reason?: string };

  if (!pubkey || typeof pubkey !== 'string' || pubkey.length < 8) {
    return NextResponse.json({ error: 'pubkey is required' }, { status: 400 });
  }

  const override = await prisma.wotOverride.upsert({
    where: { serverId_pubkey: { serverId, pubkey } },
    update: { reason: reason || null, addedBy: actor.pubkey },
    create: { serverId, pubkey, reason: reason || null, addedBy: actor.pubkey },
  });

  return NextResponse.json({ override }, { status: 201 });
}

// DELETE /api/servers/:serverId/wot/overrides?pubkey=... — remove an override (admin+)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const url = new URL(req.url);
  const pubkey = url.searchParams.get('pubkey');
  if (!pubkey) {
    return NextResponse.json({ error: 'pubkey query param required' }, { status: 400 });
  }

  await prisma.wotOverride.deleteMany({
    where: { serverId, pubkey },
  });

  return NextResponse.json({ ok: true });
}
