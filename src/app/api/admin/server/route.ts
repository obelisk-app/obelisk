import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';
import {
  SERVER_MAX_CEILING,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_DOC_TYPES,
} from '@/lib/attachments';

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
  const data: Record<string, string | number | null> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  // Per-server upload limits. Each is a positive integer in bytes, clamped
  // to `SERVER_MAX_CEILING` (500 MB). Values outside the valid range return
  // 400 so misconfiguration is loud, not silently clamped.
  const numericFields = [
    'maxImageBytes',
    'maxVideoBytes',
    'maxDocBytes',
    'maxAudioBytes',
  ] as const;
  for (const field of numericFields) {
    if (body[field] === undefined) continue;
    const n = Number(body[field]);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: `${field} must be a positive integer (bytes)` },
        { status: 400 },
      );
    }
    if (n > SERVER_MAX_CEILING) {
      return NextResponse.json(
        {
          error: `${field} exceeds the absolute ceiling of ${SERVER_MAX_CEILING} bytes`,
        },
        { status: 400 },
      );
    }
    data[field] = n;
  }

  // `allowedMimeTypes`: accepts an array of mime strings (each must appear
  // in the global allowlist) or null to "use the global allowlist". Stored
  // as JSON text so non-trivial shapes don't need a separate table.
  if (body.allowedMimeTypes !== undefined) {
    if (body.allowedMimeTypes === null) {
      data.allowedMimeTypes = null;
    } else if (Array.isArray(body.allowedMimeTypes)) {
      const globalAllowlist = new Set<string>([
        ...ALLOWED_IMAGE_TYPES,
        ...ALLOWED_VIDEO_TYPES,
        ...ALLOWED_AUDIO_TYPES,
        ...ALLOWED_DOC_TYPES,
      ]);
      const arr = body.allowedMimeTypes.filter(
        (m: unknown): m is string => typeof m === 'string',
      );
      for (const m of arr) {
        if (!globalAllowlist.has(m)) {
          return NextResponse.json(
            { error: `allowedMimeTypes contains unsupported type: ${m}` },
            { status: 400 },
          );
        }
      }
      data.allowedMimeTypes = JSON.stringify(arr);
    } else {
      return NextResponse.json(
        { error: 'allowedMimeTypes must be an array of strings or null' },
        { status: 400 },
      );
    }
  }

  // Welcome bot: admin-configurable channel + language.
  // welcomeChannelId accepts string | null; null disables the bot.
  if (body.welcomeChannelId !== undefined) {
    if (body.welcomeChannelId === null || body.welcomeChannelId === '') {
      data.welcomeChannelId = null;
    } else {
      const channelId = String(body.welcomeChannelId);
      const channel = await prisma.channel.findFirst({
        where: { id: channelId, serverId, type: 'text' },
        select: { id: true },
      });
      if (!channel) {
        return NextResponse.json(
          { error: 'welcomeChannelId must reference a text channel in this server' },
          { status: 400 }
        );
      }
      data.welcomeChannelId = channel.id;
    }
  }

  if (body.welcomeLocale !== undefined) {
    if (body.welcomeLocale === null || body.welcomeLocale === '') {
      data.welcomeLocale = null;
    } else if (body.welcomeLocale === 'es' || body.welcomeLocale === 'en') {
      data.welcomeLocale = body.welcomeLocale;
    } else {
      return NextResponse.json(
        { error: "welcomeLocale must be 'es', 'en', or null" },
        { status: 400 }
      );
    }
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
    data.ownerPubkey = newOwner.toLowerCase();

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
