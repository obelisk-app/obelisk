import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { listGames } from '@/lib/games/registry';

export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ games: listGames() });
}
