import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { postWelcomeMessage } from '@/lib/welcome';
import { isInWot, maybeAutoRefreshWot } from '@/lib/wot';
import { fetchAndSyncProfileDeduped } from '@/lib/profile-sync';

/**
 * POST /api/servers/:serverId/join — join a server.
 *
 * Access rules (in order):
 *   1. Already a member → idempotent success with `alreadyMember=true`.
 *   2. Banned → 403 with reason.
 *   3. WoT enabled → must be in WotEntry or WotOverride. Otherwise 403.
 *   4. WoT disabled → falls back to legacy `joinMode`:
 *        - `open`         → join freely
 *        - `invite-only`  → 403, must redeem an invite via /api/invitations/:code
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { serverId } = await params;
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      name: true,
      icon: true,
      banner: true,
      joinMode: true,
      wotEnabled: true,
    },
  });

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  // Already a member? Idempotent — don't error, don't double-post welcome.
  const existingMember = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (existingMember) {
    return NextResponse.json({
      server: { id: server.id, name: server.name, icon: server.icon, banner: server.banner },
      alreadyMember: true,
      message: 'You are already a member of this server',
    });
  }

  // Banned? Return reason.
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId, pubkey } },
  });
  if (ban) {
    return NextResponse.json(
      {
        error: 'You are banned from this server',
        banned: true,
        reason: ban.reason ?? null,
      },
      { status: 403 }
    );
  }

  // WoT enforcement (overrides joinMode when enabled).
  if (server.wotEnabled) {
    // Best-effort background refresh of the cached follow list.
    maybeAutoRefreshWot(serverId).catch(() => {});

    const check = await isInWot(serverId, pubkey);
    if (!check.allowed) {
      return NextResponse.json(
        {
          error:
            'This server requires being followed by the referente or holding an invite',
          wotDenied: true,
        },
        { status: 403 }
      );
    }
  } else if (server.joinMode === 'invite-only') {
    return NextResponse.json(
      { error: 'This server requires an invitation' },
      { status: 403 }
    );
  }

  await prisma.member.create({
    data: { serverId, pubkey, role: 'member' },
  });

  // Best-effort inline profile fetch so the new member shows up with a
  // display name and avatar immediately — no F5, no admin refresh needed.
  // Relay failure is non-fatal: the row exists and lazy refresh
  // (triggerBackgroundRefreshIfStale on GET /api/members) will retry.
  try {
    await Promise.race([
      fetchAndSyncProfileDeduped(pubkey, serverId),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('profile-fetch-timeout')), 3000),
      ),
    ]);
  } catch {
    // non-fatal
  }

  await postWelcomeMessage(serverId, pubkey);

  return NextResponse.json({
    server: { id: server.id, name: server.name, icon: server.icon, banner: server.banner },
  });
}
