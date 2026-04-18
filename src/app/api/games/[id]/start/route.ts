import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { getGameFull, serializeGame, startGameRow } from '@/lib/games/runtime';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const game = await getGameFull(id);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (game.createdBy !== pubkey) return NextResponse.json({ error: 'Only creator can start' }, { status: 403 });
  if (game.participants.length < game.minPlayers) {
    return NextResponse.json({ error: `Need at least ${game.minPlayers} players` }, { status: 400 });
  }
  try {
    const g2 = await startGameRow(id);
    return NextResponse.json({ game: serializeGame(g2) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to start' }, { status: 400 });
  }
}
