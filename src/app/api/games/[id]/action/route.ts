import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { applyPlayerAction, serializeGame } from '@/lib/games/runtime';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });
  try {
    const g = await applyPlayerAction(id, pubkey, action);
    return NextResponse.json({ game: serializeGame(g) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Action failed' }, { status: 400 });
  }
}
