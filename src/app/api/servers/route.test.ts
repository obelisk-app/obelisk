import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn() },
    server: { create: vi.fn(), findFirst: vi.fn() },
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
    mockPrisma.server.findFirst.mockResolvedValue({ id: 'existing' });
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 403 if user does not own any server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { name: 'My Server' }));
    expect(res.status).toBe(403);
  });

  it('creates a server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findFirst.mockResolvedValue({ id: 'existing' });
    mockPrisma.server.create.mockResolvedValue({
      id: 'new-srv', name: 'My Server', icon: null, banner: null,
    });

    const res = await POST(makeRequest('POST', { name: 'My Server' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('My Server');
  });

  describe('instance owner', () => {
    const ENV_KEY = 'INSTANCE_OWNER_PUBKEY';
    let original: string | undefined;

    beforeEach(() => {
      original = process.env[ENV_KEY];
      process.env[ENV_KEY] = 'instance-pk';
    });

    afterEach(() => {
      if (original === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = original;
    });

    it('allows instance owner to create even if they own no servers', async () => {
      mockGetAuth.mockResolvedValue('instance-pk');
      mockPrisma.server.findFirst.mockResolvedValue(null);
      mockPrisma.server.create.mockResolvedValue({
        id: 'new-srv', name: 'Bootstrap', icon: null, banner: null,
      });

      const res = await POST(makeRequest('POST', { name: 'Bootstrap' }));
      expect(res.status).toBe(201);
      // Crucially: the ownership pre-check was skipped for the instance owner
      expect(mockPrisma.server.findFirst).not.toHaveBeenCalled();
    });
  });
});
