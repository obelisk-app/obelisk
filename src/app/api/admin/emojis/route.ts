import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireRole,
  requireServerIdFromQuery,
  getAuthMember,
} from '@/lib/auth-roles';

export const runtime = 'nodejs';

const NAME_REGEX = /^[a-z0-9_-]{2,32}$/;

// GET /api/admin/emojis?serverId=... — list custom emojis.
// Intentionally open to any server member (not just mods) because the
// client needs the map to render `:name:` tokens in messages and reactions.
// Instance owner falls through to the default (no Member row required).
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const member = await getAuthMember(req, serverId);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const emojis = await prisma.serverEmoji.findMany({
    where: { serverId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, url: true, createdBy: true, createdAt: true },
  });

  return NextResponse.json({ emojis });
}

// POST /api/admin/emojis?serverId=... — upload a custom emoji. Mod+ only.
// Body: { name, url }. `url` is expected to already be the result of a
// prior POST to /api/upload (or a server-hosted /uploads/ path).
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  let body: { name?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (!NAME_REGEX.test(name)) {
    return NextResponse.json(
      { error: 'name must match [a-z0-9_-]{2,32}' },
      { status: 400 },
    );
  }
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  // Must be one of our own hosted uploads (absolute or path-only form). This
  // prevents mods from linking arbitrary external URLs that could host
  // tracking pixels or break over time.
  try {
    const u = new URL(url, 'http://local');
    if (!u.pathname.startsWith('/uploads/')) {
      return NextResponse.json(
        { error: 'url must be a hosted /uploads/ path' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'url is malformed' }, { status: 400 });
  }

  try {
    const created = await prisma.serverEmoji.create({
      data: { serverId, name, url, createdBy: actor.pubkey },
      select: { id: true, name: true, url: true, createdBy: true, createdAt: true },
    });
    return NextResponse.json({ emoji: created }, { status: 201 });
  } catch (err: unknown) {
    // Unique constraint violation — same name already exists on this server
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: `An emoji named :${name}: already exists on this server` },
        { status: 409 },
      );
    }
    throw err;
  }
}

// DELETE /api/admin/emojis?serverId=...&id=... — remove a custom emoji. Mod+.
export async function DELETE(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  // Scope the delete to this server so a mod on server A can't delete an
  // emoji on server B even if they guess its ID.
  const result = await prisma.serverEmoji.deleteMany({ where: { id, serverId } });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Emoji not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
