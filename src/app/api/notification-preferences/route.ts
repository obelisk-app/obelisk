import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const VALID_SCOPES = new Set(['server', 'channel', 'dm']);

export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const prefs = await prisma.notificationPreference.findMany({ where: { pubkey } });
  return NextResponse.json({ prefs });
}

export async function PUT(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const scopeType = body?.scopeType;
  const scopeId = body?.scopeId;
  const notifyLevel = body?.notifyLevel ?? null;
  const mutedUntilRaw = body?.mutedUntil ?? null;

  if (!VALID_SCOPES.has(scopeType) || typeof scopeId !== 'string' || !scopeId) {
    return NextResponse.json({ error: 'invalid scope' }, { status: 400 });
  }
  if (notifyLevel !== null && !['all', 'mentions', 'nothing'].includes(notifyLevel)) {
    return NextResponse.json({ error: 'invalid notifyLevel' }, { status: 400 });
  }

  const mutedUntil = mutedUntilRaw ? new Date(mutedUntilRaw) : null;
  const pref = await prisma.notificationPreference.upsert({
    where: { pubkey_scopeType_scopeId: { pubkey, scopeType, scopeId } },
    create: { pubkey, scopeType, scopeId, notifyLevel, mutedUntil },
    update: { notifyLevel, mutedUntil },
  });
  return NextResponse.json({ pref });
}

export async function DELETE(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const scopeType = body?.scopeType;
  const scopeId = body?.scopeId;
  if (!VALID_SCOPES.has(scopeType) || typeof scopeId !== 'string' || !scopeId) {
    return NextResponse.json({ error: 'invalid scope' }, { status: 400 });
  }

  await prisma.notificationPreference.delete({
    where: { pubkey_scopeType_scopeId: { pubkey, scopeType, scopeId } },
  });
  return NextResponse.json({ ok: true });
}
