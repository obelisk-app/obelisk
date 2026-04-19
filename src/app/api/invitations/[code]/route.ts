import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { postWelcomeMessage } from '@/lib/welcome';
import { isInWot, maybeAutoRefreshWot } from '@/lib/wot';

const SERVER_PUBLIC_SELECT = {
  id: true,
  name: true,
  icon: true,
  banner: true,
  joinMode: true,
  wotEnabled: true,
  _count: { select: { members: true } },
} as const;

// GET /api/invitations/:code — validate an invitation (public info).
// Resolves invite aliases (permanent named slugs) first, then falls back
// to the usage-counted Invitation table.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = rawCode.toLowerCase();

  // 1) Try as alias (stateless redirect into open-join flow).
  const alias = await prisma.inviteAlias.findUnique({
    where: { slug: code },
    include: { server: { select: SERVER_PUBLIC_SELECT } },
  });
  if (alias) {
    if (!alias.enabled) {
      return NextResponse.json({ error: 'Invitation disabled' }, { status: 410 });
    }
    let alreadyMember = false;
    try {
      const pubkey = (await getAuthPubkey(req)) ?? null;
      if (pubkey) {
        const m = await prisma.member.findUnique({
          where: { serverId_pubkey: { serverId: alias.serverId, pubkey } },
          select: { id: true },
        });
        alreadyMember = !!m;
      }
    } catch {
      // public endpoint — ignore auth errors
    }
    const { joinMode, wotEnabled, ...serverPublic } = alias.server;
    return NextResponse.json({
      kind: 'alias',
      server: serverPublic,
      targetPubkey: null,
      alreadyMember,
    });
  }

  // 2) Fall back to the Invitation table (usage-counted codes).
  const invitation = await prisma.invitation.findUnique({
    where: { code },
    include: {
      server: {
        select: { id: true, name: true, icon: true, banner: true, _count: { select: { members: true } } },
      },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
  }

  // Check revoked (soft-delete — history is preserved in the admin panel)
  if (invitation.revokedAt) {
    return NextResponse.json({ error: 'Invitation revoked' }, { status: 410 });
  }

  // Check expiry
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  // Check uses
  if (invitation.uses >= invitation.maxUses) {
    return NextResponse.json({ error: 'Invitation fully used' }, { status: 410 });
  }

  // If the caller is already authenticated and a member of this server, tell
  // the client so the invite page can render the "already joined" state
  // instead of the Accept Invite button. No invite use is consumed here.
  let alreadyMember = false;
  let pubkey: string | null = null;
  try {
    pubkey = (await getAuthPubkey(req)) ?? null;
  } catch {
    pubkey = null;
  }
  if (pubkey) {
    const existingMember = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
      select: { id: true },
    });
    alreadyMember = !!existingMember;
  }

  return NextResponse.json({
    server: invitation.server,
    targetPubkey: invitation.targetPubkey,
    alreadyMember,
  });
}

// POST /api/invitations/:code — accept/redeem an invitation.
//
// Behavior:
//   - Existing members: returns 200 + alreadyMember=true. No invite use is consumed.
//   - Banned users: 403 with the ban reason (if any). No use consumed.
//   - New members: creates a Member row tagged with joinedViaInviteId so the
//     admin panel can show "joined via <code>". Increments invite uses.
//     Posts the welcome message.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { code: rawCode } = await params;
  const code = rawCode.toLowerCase();

  // Alias path: stateless join into an open server. Aliases carry no use
  // counter, no target, and do NOT tag the Member with joinedViaInviteId.
  const alias = await prisma.inviteAlias.findUnique({
    where: { slug: code },
    include: {
      server: {
        select: {
          id: true, name: true, icon: true, banner: true,
          joinMode: true, wotEnabled: true,
        },
      },
    },
  });
  if (alias) {
    if (!alias.enabled) {
      return NextResponse.json({ error: 'Invitation disabled' }, { status: 410 });
    }
    const serverPublic = {
      id: alias.server.id,
      name: alias.server.name,
      icon: alias.server.icon,
      banner: alias.server.banner,
    };

    const ban = await prisma.ban.findUnique({
      where: { serverId_pubkey: { serverId: alias.serverId, pubkey } },
    });
    if (ban) {
      return NextResponse.json(
        { error: 'You are banned from this server', banned: true, reason: ban.reason ?? null },
        { status: 403 }
      );
    }

    const existing = await prisma.member.findUnique({
      where: { serverId_pubkey: { serverId: alias.serverId, pubkey } },
    });
    if (existing) {
      return NextResponse.json({
        server: serverPublic,
        alreadyMember: true,
        message: 'You are already a member of this server',
      });
    }

    // Aliases respect the same access rules as POST /api/servers/:id/join:
    // WoT takes precedence; otherwise require joinMode=open.
    if (alias.server.wotEnabled) {
      maybeAutoRefreshWot(alias.serverId).catch(() => {});
      const check = await isInWot(alias.serverId, pubkey);
      if (!check.allowed) {
        return NextResponse.json(
          {
            error: 'This server requires being followed by the referente or holding an invite',
            wotDenied: true,
          },
          { status: 403 }
        );
      }
    } else if (alias.server.joinMode !== 'open') {
      return NextResponse.json(
        { error: 'This server is not open — an invite code is required' },
        { status: 403 }
      );
    }

    await prisma.member.create({
      data: { serverId: alias.serverId, pubkey, role: 'member' },
    });

    void postWelcomeMessage(alias.serverId, pubkey).catch((err) => {
      console.warn('[invitations] postWelcomeMessage failed:', err);
    });

    return NextResponse.json({ server: serverPublic });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { code },
    include: {
      server: { select: { id: true, name: true, icon: true, banner: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
  }

  if (invitation.revokedAt) {
    return NextResponse.json({ error: 'Invitation revoked' }, { status: 410 });
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invitation expired' }, { status: 410 });
  }

  if (invitation.uses >= invitation.maxUses) {
    return NextResponse.json({ error: 'Invitation fully used' }, { status: 410 });
  }

  // Check target restriction
  if (invitation.targetPubkey && invitation.targetPubkey.toLowerCase() !== pubkey.toLowerCase()) {
    return NextResponse.json({ error: 'This invitation is for a different user' }, { status: 403 });
  }

  // Check ban — surface the reason if available
  const ban = await prisma.ban.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
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

  // Already a member? Don't consume the invite, don't re-post welcome.
  const existingMember = await prisma.member.findUnique({
    where: { serverId_pubkey: { serverId: invitation.serverId, pubkey } },
  });
  if (existingMember) {
    return NextResponse.json({
      server: invitation.server,
      alreadyMember: true,
      message: 'You are already a member of this server',
    });
  }

  // New member: create + tag with invite source + increment uses atomically.
  await prisma.$transaction([
    prisma.member.create({
      data: {
        serverId: invitation.serverId,
        pubkey,
        role: 'member',
        joinedViaInviteId: invitation.id,
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { uses: { increment: 1 } },
    }),
  ]);

  // Fire-and-forget — `postWelcomeMessage` awaits a profile fetch for
  // freshly-joined users so the welcome banner includes their avatar
  // (see welcome.ts). Running inline would stall the invite acceptance
  // for up to 8s on slow relays. Background posting delivers the
  // welcome message via Socket.io once the profile lands.
  void postWelcomeMessage(invitation.serverId, pubkey).catch((err) => {
    console.warn('[invitations] postWelcomeMessage failed:', err);
  });

  return NextResponse.json({ server: invitation.server });
}
