import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findMany: vi.fn() },
    member: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

const ENV_KEY = 'INSTANCE_OWNER_PUBKEY';
let originalEnv: string | undefined;

function makeRequest() {
  return new NextRequest('http://localhost/api/admin/servers', {
    headers: { cookie: 'session=tok' },
  });
}

describe('GET /api/admin/servers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('instance owner sees every server', async () => {
    process.env[ENV_KEY] = 'instance-pk';
    mockGetAuth.mockResolvedValue('instance-pk');
    mockPrisma.server.findMany.mockResolvedValue([
      { id: 'srv1', name: 'A', icon: null, banner: null, ownerPubkey: 'someone' },
      { id: 'srv2', name: 'B', icon: null, banner: null, ownerPubkey: 'someone-else' },
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.instanceOwner).toBe(true);
    expect(data.servers).toHaveLength(2);
    expect(data.servers[0].role).toBe('owner');
    expect(data.servers[0].viaInstanceOwner).toBe(true);
  });

  it('non-instance owner sees only their memberships + owned servers', async () => {
    delete process.env[ENV_KEY];
    mockGetAuth.mockResolvedValue('user-pk');
    mockPrisma.member.findMany.mockResolvedValue([
      {
        role: 'admin',
        server: {
          id: 'srv1',
          name: 'Admin Server',
          icon: null,
          banner: null,
          ownerPubkey: 'someone-else',
        },
      },
      {
        role: 'mod',
        server: {
          id: 'srv2',
          name: 'Mod Server',
          icon: null,
          banner: null,
          ownerPubkey: 'another',
        },
      },
    ]);
    mockPrisma.server.findMany.mockResolvedValue([
      {
        id: 'srv3',
        name: 'My Own',
        icon: null,
        banner: null,
        ownerPubkey: 'user-pk',
      },
    ]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.instanceOwner).toBe(false);
    expect(data.servers).toHaveLength(3);

    const byId = Object.fromEntries(data.servers.map((s: any) => [s.id, s]));
    expect(byId.srv1.role).toBe('admin');
    expect(byId.srv2.role).toBe('mod');
    expect(byId.srv3.role).toBe('owner');
    expect(data.servers.every((s: any) => s.viaInstanceOwner === false)).toBe(true);
  });

  it('promotes per-server owner role when caller is Server.ownerPubkey', async () => {
    delete process.env[ENV_KEY];
    mockGetAuth.mockResolvedValue('user-pk');
    // Caller has Member.role = 'admin' but is also the server's ownerPubkey.
    mockPrisma.member.findMany.mockResolvedValue([
      {
        role: 'admin',
        server: {
          id: 'srv1',
          name: 'Mine',
          icon: null,
          banner: null,
          ownerPubkey: 'user-pk',
        },
      },
    ]);
    mockPrisma.server.findMany.mockResolvedValue([]);

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.servers[0].role).toBe('owner');
  });
});
