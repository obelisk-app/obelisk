import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    serverBot: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/bots/poller', () => ({ refreshBot: vi.fn() }));

import { GET, PUT, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { refreshBot } from '@/lib/bots/poller';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeReq(method: string, body?: any, query = '?serverId=srv1') {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost/api/admin/server/bots${query}`, init);
}

function primeAdmin() {
  mockGetAuth.mockResolvedValue('admin-pk');
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
  });
}

describe('/api/admin/server/bots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET returns 403 for non-admin', async () => {
    mockGetAuth.mockResolvedValue('rando-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'rando-pk', role: 'member',
    });
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(403);
  });

  it('GET lists UI-enabled bot types, merging stored rows', async () => {
    primeAdmin();
    mockPrisma.serverBot.findMany.mockResolvedValue([
      { id: 'b1', type: 'btc-usd', enabled: true, displayName: null, avatarUrl: null, lastValue: 'BTC $1', lastFetchAt: null },
    ]);
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    const types = data.bots.map((b: any) => b.type);
    expect(types).toContain('btc-usd');
    expect(types).toContain('sats-ars');
    expect(types).not.toContain('peronio-ars'); // hidden in v1
    const btc = data.bots.find((b: any) => b.type === 'btc-usd');
    expect(btc.enabled).toBe(true);
    expect(btc.lastValue).toBe('BTC $1');
  });

  it('PUT upserts a bot config', async () => {
    primeAdmin();
    mockPrisma.serverBot.upsert.mockResolvedValue({ id: 'b1', type: 'btc-usd', enabled: true });
    const res = await PUT(makeReq('PUT', { type: 'btc-usd', enabled: true, displayName: 'My BTC' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.serverBot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serverId_type: { serverId: 'srv1', type: 'btc-usd' } },
      }),
    );
  });

  it('PUT rejects unknown bot types', async () => {
    primeAdmin();
    const res = await PUT(makeReq('PUT', { type: 'bogus', enabled: true }));
    expect(res.status).toBe(400);
  });

  it('POST refresh calls refreshBot and returns latest value', async () => {
    primeAdmin();
    mockPrisma.serverBot.findUnique
      .mockResolvedValueOnce({ id: 'b1', serverId: 'srv1', type: 'btc-usd' })
      .mockResolvedValueOnce({ id: 'b1', lastValue: 'BTC $2', lastFetchAt: new Date() });
    (refreshBot as any).mockResolvedValue(undefined);

    const res = await POST(makeReq('POST', { type: 'btc-usd' }, '?serverId=srv1&action=refresh'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.lastValue).toBe('BTC $2');
    expect(refreshBot).toHaveBeenCalledWith('b1', null);
  });

  it('POST refresh 404s when bot not configured', async () => {
    primeAdmin();
    mockPrisma.serverBot.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq('POST', { type: 'btc-usd' }, '?serverId=srv1&action=refresh'));
    expect(res.status).toBe(404);
  });
});
