import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, requireServerIdFromQuery } from '@/lib/auth-roles';
import { BOTS, botDef, isBotType } from '@/lib/bots/registry';
import { refreshBot } from '@/lib/bots/poller';

// GET /api/admin/server/bots?serverId=... — list all UI-enabled bot types for
// the given server, with each server's stored row merged in (or a synthetic
// disabled row when none exists). Admin+.
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const rows = await prisma.serverBot.findMany({ where: { serverId } });
  const byType = new Map(rows.map((r) => [r.type, r]));

  const bots = Object.values(BOTS)
    .filter((d) => d.enabledInUi)
    .map((def) => {
      const row = byType.get(def.type);
      return {
        type: def.type,
        defaultName: def.defaultName,
        defaultAvatar: def.defaultAvatar,
        intervalMs: def.intervalMs,
        id: row?.id ?? null,
        enabled: row?.enabled ?? false,
        displayName: row?.displayName ?? null,
        avatarUrl: row?.avatarUrl ?? null,
        lastValue: row?.lastValue ?? null,
        lastFetchAt: row?.lastFetchAt ?? null,
      };
    });

  return NextResponse.json({ bots });
}

// PUT /api/admin/server/bots?serverId=... — upsert config for a single bot.
// body: { type, enabled, displayName?, avatarUrl? }
export async function PUT(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type ?? '');
  if (!isBotType(type) || !BOTS[type].enabledInUi) {
    return NextResponse.json({ error: 'Unknown bot type' }, { status: 400 });
  }
  const enabled = Boolean(body?.enabled);
  const displayName =
    typeof body?.displayName === 'string' && body.displayName.trim()
      ? body.displayName.trim().slice(0, 64)
      : null;
  const avatarUrl =
    typeof body?.avatarUrl === 'string' && body.avatarUrl.trim()
      ? body.avatarUrl.trim().slice(0, 512)
      : null;

  const row = await prisma.serverBot.upsert({
    where: { serverId_type: { serverId, type } },
    update: { enabled, displayName, avatarUrl },
    create: { serverId, type, enabled, displayName, avatarUrl },
  });

  return NextResponse.json({ bot: row });
}

// POST /api/admin/server/bots?serverId=&action=refresh  body: { type }
// Runs a single fetch right now and broadcasts the update.
export async function POST(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const actor = await requireRole(req, serverId, 'admin');
  if (actor instanceof NextResponse) return actor;

  const action = req.nextUrl.searchParams.get('action');
  if (action !== 'refresh') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const type = String(body?.type ?? '');
  if (!isBotType(type)) {
    return NextResponse.json({ error: 'Unknown bot type' }, { status: 400 });
  }
  const row = await prisma.serverBot.findUnique({
    where: { serverId_type: { serverId, type } },
  });
  if (!row) return NextResponse.json({ error: 'Bot not configured' }, { status: 404 });

  const io = (globalThis as any).__io ?? null;
  await refreshBot(row.id, io);

  const refreshed = await prisma.serverBot.findUnique({ where: { id: row.id } });
  const def = botDef(type);
  return NextResponse.json({
    ok: true,
    lastValue: refreshed?.lastValue ?? null,
    lastFetchAt: refreshed?.lastFetchAt ?? null,
    defaultName: def?.defaultName,
  });
}
