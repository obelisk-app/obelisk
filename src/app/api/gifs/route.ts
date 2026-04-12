import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getAuthMember,
  requireServerIdFromQuery,
} from '@/lib/auth-roles';

export const runtime = 'nodejs';

// GET /api/gifs?serverId=... — member-facing list of the server's GIF
// library. Open to any server member (not just mods) since the picker needs
// it. Mirrors the emoji listing at /api/admin/emojis which is also open to
// members by design — the admin/member split here is about write access, not
// read access.
export async function GET(req: NextRequest) {
  const serverIdOrError = requireServerIdFromQuery(req);
  if (serverIdOrError instanceof NextResponse) return serverIdOrError;
  const serverId = serverIdOrError;

  const member = await getAuthMember(req, serverId);
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const gifs = await prisma.serverGif.findMany({
    where: { serverId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      tags: true,
      width: true,
      height: true,
    },
  });

  return NextResponse.json({ gifs });
}
