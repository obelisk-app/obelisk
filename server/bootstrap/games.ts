// server/bootstrap/games.ts
// Re-arm turn timers for any in_progress games surviving a restart, and
// either expire-now or re-schedule expiry for waiting games so no stale
// "Unirme" cards linger across reboots.

import type { ServerContext } from '../context';

export function start(ctx: ServerContext): void {
  void (async () => {
    try {
      const { scheduleTurnTimer, scheduleWaitingExpiry, WAITING_EXPIRY_MINUTES } = await import('../../src/lib/games/runtime');
      const active = await ctx.prisma.game.findMany({
        where: { status: 'in_progress' },
        select: { id: true, turnDeadline: true },
      });
      for (const g of active) {
        if (g.turnDeadline) scheduleTurnTimer(g.id, g.turnDeadline);
      }
      const waitingCutoff = new Date(Date.now() - WAITING_EXPIRY_MINUTES * 60 * 1000);
      // Anything older than the cutoff: mark cancelled in bulk (no-broadcast
      // bulk update is fine — nobody's subscribed yet at boot time).
      await ctx.prisma.game.updateMany({
        where: { status: 'waiting', createdAt: { lt: waitingCutoff } },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      const waiting = await ctx.prisma.game.findMany({
        where: { status: 'waiting' },
        select: { id: true, createdAt: true },
      });
      for (const g of waiting) scheduleWaitingExpiry(g.id, g.createdAt);
    } catch (err) {
      console.error('[games] Failed to rehydrate game timers:', err);
    }
  })();
}
