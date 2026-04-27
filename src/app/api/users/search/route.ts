import { NextRequest, NextResponse } from 'next/server';
import { nip19 } from 'nostr-tools';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

export interface UserSearchResult {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
}

const MAX_LIMIT = 20;

function tryDecodePubkey(input: string): string | null {
  const trimmed = input.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data as string;
    if (decoded.type === 'nprofile') return (decoded.data as { pubkey: string }).pubkey;
  } catch { /* fall through */ }
  return null;
}

// GET /api/users/search?q=...&limit=10
// Searches the Obelisk Member table for known accounts matching `q`.
// Matches against displayName, nip05, nickname, or pubkey/npub. Results
// are deduplicated by pubkey (the same person may be a member of many
// servers); we keep the row with the most recently synced profile.
export async function GET(req: NextRequest) {
  const viewer = await getAuthPubkey(req);
  if (!viewer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10) || 10, MAX_LIMIT);

  if (!q) return NextResponse.json({ results: [] });

  const decodedHex = tryDecodePubkey(q);
  const orFilters: any[] = [
    { displayName: { contains: q, mode: 'insensitive' } },
    { nickname: { contains: q, mode: 'insensitive' } },
    { nip05: { contains: q, mode: 'insensitive' } },
  ];
  if (decodedHex) {
    orFilters.push({ pubkey: decodedHex });
  } else if (/^[0-9a-f]{4,}$/i.test(q)) {
    orFilters.push({ pubkey: { startsWith: q.toLowerCase() } });
  }

  const rows = await prisma.member.findMany({
    where: { OR: orFilters },
    select: {
      pubkey: true,
      displayName: true,
      picture: true,
      nip05: true,
      profileUpdatedAt: true,
    },
    // Pull a generous slab so dedupe-by-pubkey still produces `limit` rows
    // when many of them happen to share the same person across servers.
    take: limit * 4,
    orderBy: { profileUpdatedAt: 'desc' },
  });

  const byPubkey = new Map<string, UserSearchResult>();
  for (const r of rows) {
    if (byPubkey.has(r.pubkey)) continue;
    byPubkey.set(r.pubkey, {
      pubkey: r.pubkey,
      displayName: r.displayName,
      picture: r.picture,
      nip05: r.nip05,
    });
    if (byPubkey.size >= limit) break;
  }

  // Don't suggest the viewer themselves.
  byPubkey.delete(viewer);

  return NextResponse.json({ results: Array.from(byPubkey.values()) });
}
