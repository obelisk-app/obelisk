import type { Server as IOServer } from 'socket.io';
import { prisma } from '@/lib/db';
import { BOTS, botDef, type BotType } from './registry';

// Refreshes each enabled ServerBot when its per-type interval has elapsed,
// persists the new value, and broadcasts `bot-updated` to all Socket.io
// clients. Clients filter by their currently-active server. Failures are
// logged but never thrown — a missing price shouldn't take down the server.

export async function refreshBot(botId: string, io: IOServer | null): Promise<void> {
  const bot = await prisma.serverBot.findUnique({ where: { id: botId } });
  if (!bot) return;
  const def = botDef(bot.type);
  if (!def) return;

  try {
    const value = await def.fetchValue();
    const updated = await prisma.serverBot.update({
      where: { id: bot.id },
      data: { lastValue: value, lastFetchAt: new Date() },
    });
    if (io) {
      io.emit('bot-updated', {
        serverId: updated.serverId,
        id: updated.id,
        type: updated.type,
        displayName: updated.displayName ?? def.defaultName,
        avatarUrl: updated.avatarUrl ?? def.defaultAvatar,
        lastValue: updated.lastValue,
      });
    }
  } catch (err) {
    console.warn(`[bots] ${bot.type} refresh failed:`, (err as Error)?.message ?? err);
  }
}

async function tick(io: IOServer | null): Promise<void> {
  const now = Date.now();
  const bots = await prisma.serverBot.findMany({ where: { enabled: true } });
  for (const bot of bots) {
    const def = botDef(bot.type);
    if (!def) continue;
    const last = bot.lastFetchAt ? bot.lastFetchAt.getTime() : 0;
    if (now - last < def.intervalMs) continue;
    await refreshBot(bot.id, io);
  }
}

export function startBotPoller(io: IOServer): () => void {
  let stopped = false;
  const run = () => {
    if (stopped) return;
    tick(io).catch((e) => console.warn('[bots] tick error', e));
  };
  // Kick off shortly after startup, then every 30s.
  const initial = setTimeout(run, 5_000);
  const interval = setInterval(run, 30_000);
  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(interval);
  };
}

export { BOTS, type BotType };
