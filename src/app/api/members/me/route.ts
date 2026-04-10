import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

/**
 * PATCH /api/members/me — update own profile across every server the caller
 * is currently a Member of.
 *
 * IMPORTANT: this endpoint is UPDATE-only. It must never CREATE Member rows.
 * Previously it was an upsert, which silently re-added kicked/banned users to
 * the server every time the chat UI auto-called it on page load. Returns 404
 * if the caller is not a member of any server. Banned servers are skipped via
 * the ban filter below.
 */
export async function PATCH(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { displayName, picture, nip05, about, banner, lud16, website, nickname } = await req.json();

  // Find every server where the caller has a Member row AND is NOT banned.
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
    return NextResponse.json(
      { error: 'No active membership to update' },
      { status: 404 }
    );
  }

  const profileData = {
    displayName: displayName || null,
    picture: picture || null,
    nip05: nip05 || null,
    about: about || null,
    banner: banner || null,
    lud16: lud16 || null,
    website: website || null,
    profileUpdatedAt: new Date(),
  };

  // Only include nickname if explicitly provided (don't overwrite with null)
  const updateData = nickname !== undefined
    ? { ...profileData, nickname: nickname || null }
    : profileData;

  await prisma.member.updateMany({
    where: { id: { in: updatable.map((m) => m.id) } },
    data: updateData,
  });

  // Return the updated row from any one of the servers — the data is the same
  // shape across all of them. We just need to give the caller a coherent payload.
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
