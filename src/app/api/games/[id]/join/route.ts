import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { broadcastGame, getGameFull, serializeGame } from '@/lib/games/runtime';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const game = await getGameFull(id);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (game.status !== 'waiting') return NextResponse.json({ error: 'Game already started' }, { status: 400 });
  if (game.participants.length >= game.maxPlayers) return NextResponse.json({ error: 'Full' }, { status: 400 });
  if (game.participants.some((p) => p.pubkey === pubkey)) {
    return NextResponse.json({ game: serializeGame(game) });
  }
  const member = await prisma.member.findUnique({ where: { serverId_pubkey: { serverId: game.serverId, pubkey } } });
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const nextSeat = game.participants.length;
  await prisma.gameParticipant.create({
    data: { gameId: id, pubkey, seat: nextSeat, status: 'joined' },
  });
  const g2 = await getGameFull(id);
  if (g2) broadcastGame(g2);
  return NextResponse.json({ game: g2 ? serializeGame(g2) : null });
}
