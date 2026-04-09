import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/dm/:pubkey/read — mark DM thread as read
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pubkey: string }> }
) {
  const myPubkey = await getAuthPubkey(req);
  if (!myPubkey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { pubkey: threadPubkey } = await params;

  await prisma.dMReadState.upsert({
    where: { pubkey_threadPubkey: { pubkey: myPubkey, threadPubkey } },
    create: {
      pubkey: myPubkey,
      threadPubkey,
      lastReadAt: new Date(),
    },
    update: {
      lastReadAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
