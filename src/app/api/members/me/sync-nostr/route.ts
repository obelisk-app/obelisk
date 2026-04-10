import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchProfileFromRelay, syncProfileToDb } from '@/lib/profile-sync';

// POST /api/members/me/sync-nostr — fetch fresh profile from Nostr relays and save
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const server = await prisma.server.findFirst();
  if (!server) {
    return NextResponse.json({ error: 'No server' }, { status: 404 });
  }

  const profile = await fetchProfileFromRelay(pubkey);
  if (!profile) {
    return NextResponse.json({ error: 'Could not fetch profile from relays' }, { status: 502 });
  }

  const member = await syncProfileToDb(pubkey, server.id, profile);

  return NextResponse.json({
    pubkey: member.pubkey,
    displayName: member.displayName,
    picture: member.picture,
    nip05: member.nip05,
    about: member.about,
    banner: member.banner,
    lud16: member.lud16,
    website: member.website,
    nickname: member.nickname,
  });
}
