import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const settings = await prisma.instanceSettings.findUnique({
    where: { id: 'global' },
    include: {
      defaultServer: {
        select: { id: true, name: true, icon: true }
      }
    }
  });

  if (!settings || !settings.defaultServer) {
    return NextResponse.json({ defaultServer: null });
  }

  return NextResponse.json({ defaultServer: settings.defaultServer });
}
