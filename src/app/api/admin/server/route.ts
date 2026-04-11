import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';

// GET /api/admin/server?serverId=... — get server settings (admin+)
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  return NextResponse.json(server);
}

// PATCH /api/admin/server?serverId=... — update server settings (owner only)
export async function PATCH(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json();
  const allowed = ['name', 'icon', 'banner'] as const;
  const data: Record<string, string> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  // ownerPubkey transfer — instance owner only. Lets the instance owner
  // designate any pubkey as the primary Nostr account for a server (or
  // hand off ownership). Validates the pubkey shape; the new owner does
  // NOT need to already be a Member of this server (they'll be auto-
  // upserted with role 'owner' so the panel still shows them).
  if (body.ownerPubkey !== undefined) {
    if (!actor.instanceOwner) {
      return NextResponse.json(
        { error: 'Only the instance owner can transfer server ownership' },
        { status: 403 }
      );
    }
    const newOwner = String(body.ownerPubkey).trim();
    if (!/^[0-9a-f]{64}$/i.test(newOwner)) {
      return NextResponse.json(
        { error: 'ownerPubkey must be a 64-char hex Nostr pubkey' },
        { status: 400 }
      );
    }
    (data as Record<string, string>).ownerPubkey = newOwner.toLowerCase();

    // Ensure the new owner has a Member row so they appear in the panel.
    await prisma.member.upsert({
      where: { serverId_pubkey: { serverId, pubkey: newOwner.toLowerCase() } },
      update: { role: 'owner' },
      create: { serverId, pubkey: newOwner.toLowerCase(), role: 'owner' },
    });

    await prisma.moderationAction.create({
      data: {
        serverId,
        actorPubkey: actor.pubkey,
        targetPubkey: newOwner.toLowerCase(),
        action: 'role_change',
        metadata: JSON.stringify({ transfer: 'server_ownership', by: 'instance_owner' }),
      },
    });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const updated = await prisma.server.update({ where: { id: serverId }, data });
  return NextResponse.json(updated);
}

// DELETE /api/admin/server?serverId=... — permanently delete a server (owner only)
//
// Cascades through every relation (Channel, Category, Member, Message, Ban,
// Mute, Warning, Report, ModerationAction, Invitation, WotEntry, WotOverride,
// ReadState…) via Prisma onDelete: Cascade. Irreversible.
export async function DELETE(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'owner');
  if (actor instanceof NextResponse) return actor;

  const existing = await prisma.server.findUnique({
    where: { id: serverId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404 });
  }

  await prisma.server.delete({ where: { id: serverId } });
  return NextResponse.json({ ok: true });
}
