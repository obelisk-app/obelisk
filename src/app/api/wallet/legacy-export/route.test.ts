import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/crypto', () => ({ decrypt: vi.fn((s: string) => s.replace('enc:', '')) }));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PUBKEY = 'npub_test';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PUBKEY);
});

const makeReq = () => new NextRequest('http://x/api/wallet/legacy-export');

describe('GET /api/wallet/legacy-export', () => {
  it('returns the URI and deletes the row on first call', async () => {
    let walletDeleted = false;
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn({
      wallet: {
        findUnique: vi.fn().mockResolvedValue({ pubkey: PUBKEY, nwcUrlEncrypted: 'enc:nostr+walletconnect://x', label: 'Alby' }),
        delete: vi.fn().mockImplementation(() => { walletDeleted = true; return {}; }),
      },
    }));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ nwcUri: 'nostr+walletconnect://x', label: 'Alby' });
    expect(walletDeleted).toBe(true);
  });

  it('returns 404 when no wallet exists (already migrated)', async () => {
    (prisma.$transaction as any).mockImplementation(async (fn: any) => fn({
      wallet: {
        findUnique: vi.fn().mockResolvedValue(null),
        delete: vi.fn(),
      },
    }));
    const res = await GET(makeReq());
    expect(res.status).toBe(404);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
