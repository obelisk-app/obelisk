import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn() },
    server: { create: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

import { GET, POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(method: string, body?: any) {
  const url = 'http://localhost/api/servers';
  const init: any = { method, headers: { cookie: 'session=test' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(url, init);
}

describe('GET /api/servers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('returns user servers', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.member.findMany.mockResolvedValue([
      { server: { id: 's1', name: 'Server1', icon: null, banner: null } },
      { server: { id: 's2', name: 'Server2', icon: null, banner: null } },
    ]);

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.servers).toHaveLength(2);
    expect(data.servers[0].name).toBe('Server1');
  });
});

describe('POST /api/servers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { name: 'test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 without name', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });

  it('creates a server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.create.mockResolvedValue({
      id: 'new-srv', name: 'My Server', icon: null, banner: null,
    });

    const res = await POST(makeRequest('POST', { name: 'My Server' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('My Server');
  });
});
