import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

beforeAll(() => {
  process.env.NWC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

vi.mock('@/lib/db', () => ({
  prisma: {
    wallet: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));

import { GET, PUT, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function req(method: string, body?: any) {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
  return new NextRequest('http://localhost/api/wallet', init);
}

describe('/api/wallet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(req('GET'));
    expect(res.status).toBe(401);
  });

  it('GET returns connected=false when no wallet', async () => {
    mockGetAuth.mockResolvedValue('pk');
    mockPrisma.wallet.findUnique.mockResolvedValue(null);
    const res = await GET(req('GET'));
    const body = await res.json();
    expect(body.connected).toBe(false);
  });

  it('PUT rejects invalid NWC URL', async () => {
    mockGetAuth.mockResolvedValue('pk');
    const res = await PUT(req('PUT', { nwcUrl: 'https://example.com' }));
    expect(res.status).toBe(400);
  });

  it('PUT encrypts and upserts', async () => {
    mockGetAuth.mockResolvedValue('pk');
    mockPrisma.wallet.upsert.mockResolvedValue({ label: 'Alby' });
    const res = await PUT(req('PUT', { nwcUrl: 'nostr+walletconnect://x?relay=wss://r&secret=ab', label: 'Alby' }));
    expect(res.status).toBe(200);
    const call = mockPrisma.wallet.upsert.mock.calls[0][0];
    expect(call.create.nwcUrlEncrypted).not.toContain('walletconnect');
    expect(call.create.pubkey).toBe('pk');
  });

  it('DELETE removes the wallet', async () => {
    mockGetAuth.mockResolvedValue('pk');
    mockPrisma.wallet.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req('DELETE'));
    expect(res.status).toBe(200);
    expect(mockPrisma.wallet.deleteMany).toHaveBeenCalledWith({ where: { pubkey: 'pk' } });
  });
});
