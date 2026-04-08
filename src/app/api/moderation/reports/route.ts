import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireRole, getDefaultServerId } from '@/lib/auth-roles';
import { getAuthPubkey } from '@/lib/api-auth';

// GET /api/moderation/reports — list reports (mod+)
export async function GET(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const actor = await requireRole(req, serverId, 'mod');
  if (actor instanceof NextResponse) return actor;

  const status = req.nextUrl.searchParams.get('status') || 'pending';

  const reports = await prisma.report.findMany({
    where: { serverId, status },
    include: { message: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json(reports);
}

// POST /api/moderation/reports — submit a report (any member)
export async function POST(req: NextRequest) {
  const serverId = await getDefaultServerId();
  if (!serverId) return NextResponse.json({ error: 'No server' }, { status: 404 });

  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messageId, reason } = await req.json();
  if (!messageId || !reason) {
    return NextResponse.json({ error: 'messageId and reason required' }, { status: 400 });
  }

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });

  const report = await prisma.report.create({
    data: { serverId, messageId, reporterPubkey: pubkey, reason },
  });

  return NextResponse.json(report, { status: 201 });
}
