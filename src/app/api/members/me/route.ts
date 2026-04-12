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

  const { displayName, picture, nip05, about, banner, lud16, website, nickname, serverId } = await req.json();

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

  // Only include profile fields that were explicitly provided (don't overwrite with null)
  const profileData: Record<string, unknown> = { profileUpdatedAt: new Date() };
  if (displayName !== undefined) profileData.displayName = displayName || null;
  if (picture !== undefined) profileData.picture = picture || null;
  if (nip05 !== undefined) profileData.nip05 = nip05 || null;
  if (about !== undefined) profileData.about = about || null;
  if (banner !== undefined) profileData.banner = banner || null;
  if (lud16 !== undefined) profileData.lud16 = lud16 || null;
  if (website !== undefined) profileData.website = website || null;

  // Apply profile data to all servers
  if (Object.keys(profileData).length > 1) {
    await prisma.member.updateMany({
      where: { id: { in: updatable.map((m) => m.id) } },
      data: profileData,
    });
  }

  // Nickname is per-server — only update the specific server's member row
  if (nickname !== undefined && serverId) {
    const target = updatable.find((m) => m.serverId === serverId);
    if (target) {
      await prisma.member.update({
        where: { id: target.id },
        data: { nickname: nickname || null },
      });
    }
  }

  // Return the row for the requested server, or fall back to first updatable.
  const targetId = serverId
    ? (updatable.find((m) => m.serverId === serverId)?.id ?? updatable[0].id)
    : updatable[0].id;
  const sample = await prisma.member.findUnique({
    where: { id: targetId },
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

/**
 * GET /api/members/me?serverId=xxx — fetch own member data for a specific server.
 */
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serverId = req.nextUrl.searchParams.get('serverId');
  if (!serverId) {
    return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  }

  const member = await prisma.member.findFirst({
    where: { pubkey, serverId },
  });

  if (!member) {
    return NextResponse.json({ error: 'Not a member' }, { status: 404 });
  }

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
