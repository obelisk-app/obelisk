import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findMany: vi.fn() },
    session: { findMany: vi.fn() },
    ban: { groupBy: vi.fn() },
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
  return new NextRequest('http://localhost/api/admin/users', {
    headers: { cookie: 'session=tok' },
  });
}

describe('GET /api/admin/users', () => {
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

  it('returns 403 for non-instance-owner', async () => {
    process.env[ENV_KEY] = 'owner-pk';
    mockGetAuth.mockResolvedValue('someone-else');
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  beforeEach(() => {
    mockPrisma.ban.groupBy.mockResolvedValue([]);
  });

  it('aggregates members across servers and includes session-only users', async () => {
    process.env[ENV_KEY] = 'owner-pk';
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.member.findMany.mockResolvedValue([
      {
        pubkey: 'pk1',
        displayName: 'Alice',
        picture: 'a.png',
        nip05: null,
        joinedAt: new Date('2026-01-01'),
        profileUpdatedAt: new Date('2026-02-01'),
      },
      {
        pubkey: 'pk1',
        displayName: null,
        picture: null,
        nip05: 'a@b',
        joinedAt: new Date('2026-03-01'),
        profileUpdatedAt: null,
      },
      {
        pubkey: 'pk2',
        displayName: 'Bob',
        picture: null,
        nip05: null,
        joinedAt: new Date('2026-02-15'),
        profileUpdatedAt: null,
      },
    ]);
    mockPrisma.session.findMany.mockResolvedValue([
      { pubkey: 'pk1', createdAt: new Date('2026-03-10') },
      { pubkey: 'pk3', createdAt: new Date('2026-04-01') },
    ]);
    mockPrisma.ban.groupBy.mockResolvedValue([
      { pubkey: 'pk2', _count: { _all: 1 } },
      { pubkey: 'pk4', _count: { _all: 2 } },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    const users = body.users as Array<{ pubkey: string; serverCount: number; displayName: string | null; nip05: string | null }>;

    expect(users).toHaveLength(4);
    // pk3 (session 04-01), pk1 (member 03-01), pk2 (02-15), pk4 (ban-only, epoch)
    expect(users[0].pubkey).toBe('pk3');
    expect(users[0].serverCount).toBe(0);
    expect(users[1].pubkey).toBe('pk1');
    expect(users[1].serverCount).toBe(2);
    expect(users[1].displayName).toBe('Alice');
    expect(users[1].nip05).toBe('a@b');
    expect(users[2].pubkey).toBe('pk2');
    expect(users[2].serverCount).toBe(1);
    const byPk = Object.fromEntries(users.map((u) => [u.pubkey, u])) as Record<string, typeof users[number] & { bannedCount: number }>;
    expect(byPk.pk2.bannedCount).toBe(1);
    expect(byPk.pk4.bannedCount).toBe(2);
    expect(byPk.pk4.serverCount).toBe(0);
    expect(byPk.pk1.bannedCount).toBe(0);
  });
});
