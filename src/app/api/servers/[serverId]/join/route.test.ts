import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn(), create: vi.fn() },
    ban: { findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/welcome', () => ({
  postWelcomeMessage: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/wot', () => ({
  isInWot: vi.fn(),
  maybeAutoRefreshWot: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/profile-sync', () => ({
  fetchAndSyncProfileDeduped: vi.fn().mockResolvedValue(null),
}));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInWot } from '@/lib/wot';
import { fetchAndSyncProfileDeduped } from '@/lib/profile-sync';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockIsInWot = isInWot as ReturnType<typeof vi.fn>;
const mockFetchAndSync = fetchAndSyncProfileDeduped as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ serverId: 'srv1' });

function makeRequest() {
  return new NextRequest('http://localhost/api/servers/srv1/join', {
    method: 'POST',
    headers: { cookie: 'session=tok' },
  });
}

describe('POST /api/servers/[serverId]/join', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 without session', async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown server', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(404);
  });

  it('returns alreadyMember=true and does not re-create the Member', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alreadyMember).toBe(true);
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it('returns 403 with reason when banned', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue({ pubkey: 'pk1', reason: 'spam' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.banned).toBe(true);
    expect(data.reason).toBe('spam');
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it('blocks join when WoT is enabled and user is not in WoT', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: true,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockIsInWot.mockResolvedValue({ allowed: false, reason: 'none' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.wotDenied).toBe(true);
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it('allows join when WoT is enabled and user is in WoT', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: true,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockIsInWot.mockResolvedValue({ allowed: true, reason: 'follow' });
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.member.create).toHaveBeenCalled();
  });

  it('blocks join when WoT disabled and joinMode is invite-only', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'invite-only', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(403);
    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it('allows open join when WoT disabled and joinMode is open', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.member.create).toHaveBeenCalled();
  });

  it('triggers an inline profile fetch after creating the member', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockFetchAndSync.mockResolvedValue({ id: 'm1' });

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockFetchAndSync).toHaveBeenCalledWith('pk1', 'srv1');
  });

  it('succeeds even if the inline profile fetch fails — lazy refresh will retry', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockFetchAndSync.mockRejectedValue(new Error('relay down'));

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.member.create).toHaveBeenCalled();
  });
});
