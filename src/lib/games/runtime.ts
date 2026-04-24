// Shared game runtime used by API routes and server.ts.
// Keeps turn timers in-memory (MVP) and centralizes broadcast logic so
// routes don't need to know about socket.io directly.

import { prisma } from '@/lib/db';
import { getGameDef } from './registry';
import { ServerToClient } from '@/lib/socket-events';

type GameRow = Awaited<ReturnType<typeof prisma.game.findUnique>>;

const turnTimers = new Map<string, NodeJS.Timeout>();
const expiryTimers = new Map<string, NodeJS.Timeout>();

// Waiting games that nobody starts go stale after this many minutes. When
// the timer fires, the game flips to `cancelled` so its in-chat card
// becomes uninteresting (no Join button) and the Actividades panel drops
// it (it only lists waiting / in_progress).
export const WAITING_EXPIRY_MINUTES = 60;

function getIO(): any {
  return (globalThis as any).__io ?? null;
}

export async function getGameFull(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: { participants: { orderBy: { seat: 'asc' } } },
  });
}

export type GameFull = NonNullable<Awaited<ReturnType<typeof getGameFull>>>;

export function serializeGame(g: GameFull) {
  return {
    id: g.id,
    serverId: g.serverId,
    channelId: g.channelId,
    type: g.type,
    status: g.status,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    turnTimeoutS: g.turnTimeoutS,
    currentTurn: g.currentTurn,
    turnDeadline: g.turnDeadline,
    state: g.state,
    winnerPubkey: g.winnerPubkey,
    createdBy: g.createdBy,
    createdAt: g.createdAt,
    startedAt: g.startedAt,
    finishedAt: g.finishedAt,
    participants: g.participants.map((p) => ({
      pubkey: p.pubkey,
      seat: p.seat,
      status: p.status,
      joinedAt: p.joinedAt,
    })),
  };
}

export function broadcastGame(g: GameFull, extra?: { event?: 'game-created' | 'game-updated' | 'game-finished' | 'game-turn' }) {
  const io = getIO();
  if (!io) return;
  const event = extra?.event ?? 'game-updated';
  const payload = serializeGame(g);
  // Channel room (spectators + chat message cards) and server room (activities panel)
  io.to(`channel:${g.channelId}`).emit(event, payload);
  io.to(`server:${g.serverId}`).emit(event, payload);
  // All participants, wherever they are
  for (const p of g.participants) {
    io.to(`pubkey:${p.pubkey}`).emit(event, payload);
  }
  // Emit a dedicated game-turn so clients can trigger turn notifications
  // without having to diff currentTurn on every game-updated.
  if (event === 'game-updated' && g.status === 'in_progress' && g.currentTurn) {
    const turnPayload = {
      gameId: g.id,
      serverId: g.serverId,
      channelId: g.channelId,
      type: g.type,
      currentTurn: g.currentTurn,
      turnDeadline: g.turnDeadline,
    };
    for (const p of g.participants) {
      io.to(`pubkey:${p.pubkey}`).emit(ServerToClient.GameTurn, turnPayload);
    }
  }
}

export function clearTurnTimer(gameId: string) {
  const t = turnTimers.get(gameId);
  if (t) { clearTimeout(t); turnTimers.delete(gameId); }
}

export function clearExpiryTimer(gameId: string) {
  const t = expiryTimers.get(gameId);
  if (t) { clearTimeout(t); expiryTimers.delete(gameId); }
}

export function scheduleWaitingExpiry(gameId: string, createdAt: Date) {
  clearExpiryTimer(gameId);
  const deadline = createdAt.getTime() + WAITING_EXPIRY_MINUTES * 60 * 1000;
  const ms = Math.max(0, deadline - Date.now());
  const timer = setTimeout(() => { expireWaitingGame(gameId).catch(console.error); }, ms);
  expiryTimers.set(gameId, timer);
}

async function expireWaitingGame(gameId: string) {
  expiryTimers.delete(gameId);
  const g = await getGameFull(gameId);
  if (!g || g.status !== 'waiting') return;
  await prisma.game.update({
    where: { id: gameId },
    data: { status: 'cancelled', finishedAt: new Date() },
  });
  const g2 = await getGameFull(gameId);
  if (g2) broadcastGame(g2, { event: 'game-finished' });
}

export function scheduleTurnTimer(gameId: string, deadline: Date) {
  clearTurnTimer(gameId);
  const ms = Math.max(0, deadline.getTime() - Date.now());
  const timer = setTimeout(() => { handleTurnTimeout(gameId).catch(console.error); }, ms);
  turnTimers.set(gameId, timer);
}

async function handleTurnTimeout(gameId: string) {
  const g = await getGameFull(gameId);
  if (!g) return;
  if (g.status !== 'in_progress' || !g.currentTurn) return;
  const def = getGameDef(g.type);
  if (!def) return;

  const activePubkeys = g.participants.filter((p) => p.status === 'joined').map((p) => p.pubkey);
  const result = def.onTimeout(g.state as any, g.currentTurn, activePubkeys);

  const updates: any = {
    state: result.state as any,
    currentTurn: result.nextTurn,
    turnDeadline: result.nextTurn && g.turnTimeoutS > 0 ? new Date(Date.now() + g.turnTimeoutS * 1000) : null,
  };
  if (result.winner !== undefined || result.draw) {
    updates.status = 'finished';
    updates.winnerPubkey = result.winner ?? null;
    updates.finishedAt = new Date();
  }
  await prisma.game.update({ where: { id: gameId }, data: updates });

  if (result.eliminated?.length) {
    await prisma.gameParticipant.updateMany({
      where: { gameId, pubkey: { in: result.eliminated } },
      data: { status: 'disqualified' },
    });
  }

  const g2 = await getGameFull(gameId);
  if (!g2) return;
  if (g2.status === 'finished') {
    clearTurnTimer(gameId);
    broadcastGame(g2, { event: 'game-finished' });
  } else {
    if (g2.turnDeadline) scheduleTurnTimer(gameId, g2.turnDeadline);
    broadcastGame(g2, { event: 'game-updated' });
  }
}

export async function startGameRow(gameId: string) {
  const g = await getGameFull(gameId);
  if (!g) throw new Error('Game not found');
  if (g.status !== 'waiting') throw new Error('Game already started');
  const def = getGameDef(g.type);
  if (!def) throw new Error('Unknown game type');
  const pubkeys = g.participants.map((p) => p.pubkey);
  if (pubkeys.length < g.minPlayers) throw new Error('Not enough players');

  // Preserve any configuration stashed in the existing state at creation
  // (e.g. chain-reaction grid size). Game-specific engines should copy
  // relevant fields from `opts` when re-initializing.
  // Cancel the waiting-expiry timer — this game is actually starting.
  clearExpiryTimer(gameId);
  const initial = def.initialState(pubkeys, g.state as any);
  const firstTurn = def.firstTurn(pubkeys);
  // turnTimeoutS <= 0 means "no time limit" — skip scheduling a timer and
  // leave turnDeadline null. Clients render the clock only when deadline is set.
  const deadline = g.turnTimeoutS > 0 ? new Date(Date.now() + g.turnTimeoutS * 1000) : null;
  await prisma.game.update({
    where: { id: gameId },
    data: {
      status: 'in_progress',
      state: initial as any,
      currentTurn: firstTurn,
      turnDeadline: deadline,
      startedAt: new Date(),
    },
  });
  const g2 = await getGameFull(gameId);
  if (g2?.turnDeadline) scheduleTurnTimer(gameId, g2.turnDeadline);
  if (g2) broadcastGame(g2, { event: 'game-updated' });
  return g2!;
}

export async function applyPlayerAction(gameId: string, pubkey: string, action: any) {
  const g = await getGameFull(gameId);
  if (!g) throw new Error('Game not found');
  if (g.status !== 'in_progress') throw new Error('Game not in progress');
  if (g.currentTurn !== pubkey) throw new Error('Not your turn');
  const def = getGameDef(g.type);
  if (!def) throw new Error('Unknown game type');

  const v = def.validateAction(g.state as any, action, pubkey);
  if (!v.ok) throw new Error(v.error || 'Invalid action');

  const activePubkeys = g.participants.filter((p) => p.status === 'joined').map((p) => p.pubkey);
  const result = def.applyAction(g.state as any, action, pubkey, activePubkeys);

  const updates: any = {
    state: result.state as any,
    currentTurn: result.nextTurn,
    turnDeadline: result.nextTurn && g.turnTimeoutS > 0 ? new Date(Date.now() + g.turnTimeoutS * 1000) : null,
  };
  if (result.nextTurn === null) {
    updates.status = 'finished';
    updates.winnerPubkey = result.winner ?? null;
    updates.finishedAt = new Date();
  }
  await prisma.game.update({ where: { id: gameId }, data: updates });

  const g2 = await getGameFull(gameId);
  if (!g2) throw new Error('Game vanished');
  if (g2.status === 'finished') {
    clearTurnTimer(gameId);
    broadcastGame(g2, { event: 'game-finished' });
  } else {
    if (g2.turnDeadline) scheduleTurnTimer(gameId, g2.turnDeadline);
    broadcastGame(g2, { event: 'game-updated' });
  }
  return g2;
}
