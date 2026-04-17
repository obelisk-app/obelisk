import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock livekit-server-sdk to avoid jose's jsdom/Uint8Array mismatch — we're
// testing the route's auth + permission logic, not the JWT library.
vi.mock('livekit-server-sdk', () => ({
  AccessToken: class {
    constructor(_key: string, _secret: string, _opts: any) {}
    addGrant(_g: any) {}
    async toJwt() { return 'aaa.bbb.ccc'; }
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    memberCustomRole: { findMany: vi.fn().mockResolvedValue([]) },
    server: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  validateSession: vi.fn(),
}));

import { GET } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(channelId?: string) {
  const url = channelId
    ? `http://localhost/api/voice/token?channelId=${channelId}`
    : 'http://localhost/api/voice/token';
  return new NextRequest(url, {
    method: 'GET',
    headers: { cookie: 'session=test-token' },
  });
}

describe('GET /api/voice/token', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_URL = 'ws://livekit.local:7880';
    process.env.LIVEKIT_API_KEY = 'devkey';
    process.env.LIVEKIT_API_SECRET = 'devsecret-at-least-32-characters-long';
  });

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when channelId is missing', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 503 when LIVEKIT_URL is not configured', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    delete process.env.LIVEKIT_URL;
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('sfu_not_configured');
  });

  it('returns 404 for unknown channel', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 if channel is not a voice channel', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', type: 'text', voiceMode: null,
      readPermission: null, readRoleIds: [],
    });
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 if voice channel is in mesh mode', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', type: 'voice', voiceMode: 'mesh',
      readPermission: null, readRoleIds: [],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'other' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', role: 'member' });
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(400);
  });

  it('returns { url, token } on happy path', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.channel.findUnique.mockResolvedValue({
      id: 'ch1', serverId: 'srv1', type: 'voice', voiceMode: 'sfu',
      readPermission: null, readRoleIds: [],
    });
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'other' });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1', role: 'member' });
    const res = await GET(makeRequest('ch1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('ws://livekit.local:7880');
    expect(typeof body.token).toBe('string');
    expect(body.token).toBeTruthy();
  });
});
