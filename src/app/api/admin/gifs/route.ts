import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireRole,
  requireServerIdFromQuery,
} from '@/lib/auth-roles';

export const runtime = 'nodejs';

// Name constraints: free-form human label shown in the picker. Allows spaces
// and punctuation, unlike emoji shortcodes. 2–64 chars, trimmed.
const NAME_MIN = 2;
const NAME_MAX = 64;
const TAG_MAX_TOTAL = 256; // after joining — prevents abuse

function normalizeTags(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const tags = raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of tags) {
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }
  const joined = unique.join(',');
  return joined.slice(0, TAG_MAX_TOTAL);
}

// GET /api/admin/gifs?serverId=... — mod+ listing (same-shape response as the
// member-facing /api/gifs route, but this one is the admin's management view).
// Ordered newest-first so recently added GIFs surface at the top of the table.
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const gifs = await prisma.serverGif.findMany({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      tags: true,
      width: true,
      height: true,
      sizeBytes: true,
      uploadedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ gifs });
}

// POST /api/admin/gifs?serverId=... — register an uploaded GIF into the
// server's library. Body: { name, url, tags?, width?, height?, sizeBytes? }.
// Mirrors the emoji-upload flow: upload to /api/upload first, then POST the
// returned URL here. Mod+ only.
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  let body: {
    name?: unknown;
    url?: unknown;
    tags?: unknown;
    width?: unknown;
    height?: unknown;
    sizeBytes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return NextResponse.json(
      { error: `name must be ${NAME_MIN}–${NAME_MAX} characters` },
      { status: 400 },
    );
  }
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }
  // Must be a hosted /uploads/ path — same rationale as ServerEmoji: prevents
  // linking arbitrary external URLs that could host trackers or break later.
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

  const tags = normalizeTags(body.tags);
  const width = typeof body.width === 'number' && body.width > 0 ? Math.floor(body.width) : null;
  const height = typeof body.height === 'number' && body.height > 0 ? Math.floor(body.height) : null;
  const sizeBytes = typeof body.sizeBytes === 'number' && body.sizeBytes > 0 ? Math.floor(body.sizeBytes) : null;

  const created = await prisma.serverGif.create({
    data: {
      serverId,
      name,
      url,
      tags,
      width,
      height,
      sizeBytes,
      uploadedBy: actor.pubkey,
    },
    select: {
      id: true,
      name: true,
      url: true,
      tags: true,
      width: true,
      height: true,
      sizeBytes: true,
      uploadedBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ gif: created }, { status: 201 });
}

// DELETE /api/admin/gifs?serverId=...&id=... — remove a GIF. Mod+.
// Note: this only removes the DB row. The underlying /uploads/<id> file is
// left on disk — cleaning those up is a separate GC concern (see the emoji
// delete for the same trade-off).
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

  // Scope the delete to this server so a mod on server A can't delete a GIF
  // on server B even if they guess its ID.
  const result = await prisma.serverGif.deleteMany({ where: { id, serverId } });
  if (result.count === 0) {
    return NextResponse.json({ error: 'Gif not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
