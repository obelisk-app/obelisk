import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getGameFull, serializeGame } from '@/lib/games/runtime';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const g = await getGameFull(id);
  if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Look up the system message id (`[[game:<id>]]`) so the client can
  // thread the game-chat rail to it via replyToId.
  const sys = await prisma.message.findFirst({
    where: { channelId: g.channelId, content: `[[game:${g.id}]]`, deletedAt: null },
    select: { id: true },
  });
  return NextResponse.json({ game: { ...serializeGame(g), systemMessageId: sys?.id ?? null } });
}
