import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getGameDef } from '@/lib/games/registry';
import { broadcastGame, getGameFull, scheduleWaitingExpiry, serializeGame } from '@/lib/games/runtime';
import { ServerToClient } from '@/lib/socket-events';

// GET /api/games?serverId=...&status=waiting,in_progress
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const serverId = req.nextUrl.searchParams.get('serverId');
  if (!serverId) return NextResponse.json({ error: 'serverId required' }, { status: 400 });
  const statusParam = req.nextUrl.searchParams.get('status') ?? 'waiting,in_progress';
  const statuses = statusParam.split(',').map((s) => s.trim()).filter(Boolean);

  const games = await prisma.game.findMany({
    where: { serverId, status: { in: statuses } },
    include: { participants: { orderBy: { seat: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ games: games.map((g) => serializeGame(g as any)) });
}

// POST /api/games  { type, channelId }
// Creates a game in WAITING state, creator auto-joins as seat 0, and a
// system message `[[game:<id>]]` is posted in the channel so it appears
// inline in chat with live participant count / status / result.
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(req);
  const { type, channelId, maxPlayers: reqMax, options, turnTimeoutS: reqTimeout } = body as { type?: string; channelId?: string; maxPlayers?: number; options?: Record<string, any>; turnTimeoutS?: number };
  if (!type || !channelId) return NextResponse.json({ error: 'type and channelId required' }, { status: 400 });

  const def = getGameDef(type);
  if (!def) return NextResponse.json({ error: 'Unknown game type' }, { status: 400 });

  let maxPlayers = def.maxPlayers;
  if (typeof reqMax === 'number' && Number.isInteger(reqMax)) {
    if (reqMax < def.minPlayers || reqMax > def.maxPlayers) {
      return NextResponse.json({ error: `maxPlayers must be between ${def.minPlayers} and ${def.maxPlayers}` }, { status: 400 });
    }
    maxPlayers = reqMax;
  }

  // Optional per-game turn timeout override. 0 = no time limit.
  let turnTimeoutS = def.defaultTurnTimeoutS;
  if (typeof reqTimeout === 'number' && Number.isInteger(reqTimeout)) {
    if (reqTimeout < 0 || reqTimeout > 3600) {
      return NextResponse.json({ error: 'turnTimeoutS must be between 0 and 3600' }, { status: 400 });
    }
    turnTimeoutS = reqTimeout;
  }

  const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { serverId: true } });
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

  const member = await prisma.member.findUnique({ where: { serverId_pubkey: { serverId: channel.serverId, pubkey } } });
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const game = await prisma.game.create({
    data: {
      serverId: channel.serverId,
      channelId,
      type,
      status: 'waiting',
      minPlayers: def.minPlayers,
      maxPlayers,
      turnTimeoutS,
      state: def.initialState([pubkey], options) as any,
      createdBy: pubkey,
      participants: { create: { pubkey, seat: 0, status: 'joined' } },
    },
  });

  // Post a linkable system message in the channel so the game card is
  // visible inline. Clients render `[[game:<id>]]` markers as a live
  // GameEmbedCard showing participants/status/result.
  const msg = await prisma.message.create({
    data: {
      channelId,
      authorPubkey: pubkey,
      content: `[[game:${game.id}]]`,
    },
    include: {
      replyTo: { select: { id: true, content: true, authorPubkey: true } },
      reactions: { select: { id: true, messageId: true, authorPubkey: true, emoji: true } },
    },
  });
  const io = (globalThis as any).__io;
  if (io) io.to(`channel:${channelId}`).emit(ServerToClient.NewMessage, msg);

  const full = await getGameFull(game.id);
  if (full) {
    broadcastGame(full, { event: 'game-created' });
    // Auto-cancel this waiting game after WAITING_EXPIRY_MINUTES if nobody
    // starts it — keeps the Actividades panel tidy and prevents stale
    // "Unirme" buttons from lingering in chat history indefinitely.
    scheduleWaitingExpiry(full.id, full.createdAt);
  }
  return NextResponse.json({ game: full ? serializeGame(full) : null });
}
