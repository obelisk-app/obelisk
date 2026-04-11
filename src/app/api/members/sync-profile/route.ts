import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchAndSyncProfileDeduped } from '@/lib/profile-sync';

/**
 * POST /api/members/sync-profile — trigger a server-side relay fetch for a
 * given pubkey on the current server. Client-supplied name/picture are
 * ignored: we never trust the client for profile data, because a partial
 * write would leave nip05/about/banner empty while marking the row "fresh"
 * and hiding it from the stale-refresh pass.
 *
 * This endpoint is now a thin wrapper around `fetchAndSyncProfileDeduped`,
 * which dedupes concurrent fetches for the same pubkey.
 */
export async function POST(req: NextRequest) {
  const authPubkey = await getAuthPubkey(req);
  if (!authPubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { pubkey, serverId: bodyServerId } = body as { pubkey?: unknown; serverId?: unknown };
  if (!pubkey || typeof pubkey !== 'string') {
    return NextResponse.json({ error: 'Missing pubkey' }, { status: 400 });
  }

  // Prefer explicit serverId from the body. Fall back to the legacy
  // first-server lookup so older callers don't break.
  const server = bodyServerId && typeof bodyServerId === 'string'
    ? await prisma.server.findUnique({ where: { id: bodyServerId }, select: { id: true } })
    : await prisma.server.findFirst({ select: { id: true } });
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  // Only sync existing members — do not upsert (which would silently
  // re-create kicked/banned members).
  const existing = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId: server.id, pubkey } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not a member' }, { status: 404 });
  }

  const result = await fetchAndSyncProfileDeduped(pubkey, server.id);
  return NextResponse.json({
    ok: true,
    synced: !!result,
  });
}
