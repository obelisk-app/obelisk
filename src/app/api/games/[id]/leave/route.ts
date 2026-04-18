import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { broadcastGame, clearTurnTimer, getGameFull, serializeGame } from '@/lib/games/runtime';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const game = await getGameFull(id);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const me = game.participants.find((p) => p.pubkey === pubkey);
  if (!me) return NextResponse.json({ error: 'Not a participant' }, { status: 400 });

  if (game.status === 'waiting') {
    // Leaving a waiting game = remove from participants. If nobody left, cancel.
    await prisma.gameParticipant.delete({ where: { id: me.id } });
    const remaining = game.participants.length - 1;
    if (remaining === 0) {
      await prisma.game.update({ where: { id }, data: { status: 'cancelled', finishedAt: new Date() } });
      clearTurnTimer(id);
    }
  } else if (game.status === 'in_progress') {
    await prisma.gameParticipant.update({ where: { id: me.id }, data: { status: 'left' } });
    const remainingActive = game.participants.filter((p) => p.pubkey !== pubkey && p.status === 'joined');
    if (remainingActive.length <= 1) {
      // 2-player game: the other player wins by forfeit.
      await prisma.game.update({
        where: { id },
        data: {
          status: 'finished',
          winnerPubkey: remainingActive[0]?.pubkey ?? null,
          finishedAt: new Date(),
          currentTurn: null,
          turnDeadline: null,
        },
      });
      clearTurnTimer(id);
    }
  }
  const g2 = await getGameFull(id);
  if (g2) broadcastGame(g2, { event: g2.status === 'finished' || g2.status === 'cancelled' ? 'game-finished' : 'game-updated' });
  return NextResponse.json({ game: g2 ? serializeGame(g2) : null });
}
