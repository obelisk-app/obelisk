import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

// POST /api/forum/posts/[postId]/read
// Marks the viewer's subscription as read up to now. Auto-creates the
// subscription if it doesn't exist (so opening a post is a no-op unless
// they're subscribed). We don't upsert unconditionally — "mark as read"
// shouldn't silently follow posts the user hasn't opted into.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> },
) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { postId } = await params;

  const existing = await prisma.postSubscription.findUnique({
    where: { postId_pubkey: { postId, pubkey } },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: true, skipped: 'not subscribed' });
  }

  await prisma.postSubscription.update({
    where: { id: existing.id },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
