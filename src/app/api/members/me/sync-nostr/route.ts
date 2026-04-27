import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { fetchProfileFromRelay } from '@/lib/profile-sync';

/**
 * POST /api/members/me/sync-nostr — fetch fresh profile from Nostr relays
 * and write it to every server the caller is currently a Member of.
 *
 * UPDATE-only — never creates Member rows. Previously this called
 * `syncProfileToDb` which upserted, silently re-adding kicked/banned users.
 * Returns `{ updated: 0 }` (200) if the caller has no active memberships —
 * common in the DM-only flow where users sign in for direct messages without
 * joining a server. Treating it as 404 logged a noisy console error for
 * what's a perfectly valid no-op.
 */
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [memberships, bans] = await Promise.all([
    prisma.member.findMany({
      where: { pubkey },
      select: { id: true, serverId: true },
    }),
    prisma.ban.findMany({
      where: { pubkey },
      select: { serverId: true },
    }),
  ]);

  const bannedSet = new Set(bans.map((b) => b.serverId));
  const updatable = memberships.filter((m) => !bannedSet.has(m.serverId));

  if (updatable.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const profile = await fetchProfileFromRelay(pubkey);
  if (!profile) {
    return NextResponse.json({ error: 'Could not fetch profile from relays' }, { status: 502 });
  }

  const data = {
    displayName: profile.displayName || profile.name || null,
    picture: profile.picture || null,
    nip05: profile.nip05 || null,
    about: profile.about || null,
    banner: profile.banner || null,
    lud16: profile.lud16 || null,
    website: profile.website || null,
    profileUpdatedAt: new Date(),
  };

  await prisma.member.updateMany({
    where: { id: { in: updatable.map((m) => m.id) } },
    data,
  });

  const sample = await prisma.member.findUnique({
    where: { id: updatable[0].id },
  });

  if (!sample) {
    return NextResponse.json({ error: 'Member vanished mid-update' }, { status: 500 });
  }

  return NextResponse.json({
    pubkey: sample.pubkey,
    displayName: sample.displayName,
    picture: sample.picture,
    nip05: sample.nip05,
    about: sample.about,
    banner: sample.banner,
    lud16: sample.lud16,
    website: sample.website,
    nickname: sample.nickname,
  });
}
