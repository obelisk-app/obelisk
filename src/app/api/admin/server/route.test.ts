import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    member: { findUnique: vi.fn(), upsert: vi.fn() },
    channel: { findFirst: vi.fn() },
    moderationAction: { create: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/auth', () => ({ validateSession: vi.fn() }));

import { GET, PATCH, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

const ENV_KEY = 'INSTANCE_OWNER_PUBKEY';
let originalEnv: string | undefined;

function makeRequest(method: string, body?: any, query = '?serverId=srv1') {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost/api/admin/server${query}`, init);
}

const VALID_PUBKEY = 'a'.repeat(64);

describe('GET /api/admin/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it('returns 400 when serverId is missing', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    const res = await GET(makeRequest('GET', undefined, ''));
    expect(res.status).toBe(400);
  });

  it('returns server settings for admin', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({ ownerPubkey: 'owner-pk' }) // for getAuthMember
      .mockResolvedValueOnce({ id: 'srv1', name: 'Test', joinMode: 'open', ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('srv1');
  });

  it('returns 403 for non-admin', async () => {
    mockGetAuth.mockResolvedValue('member-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
    });

    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it('owner can update name/icon/banner', async () => {
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'owner-pk', role: 'owner',
    });
    mockPrisma.server.update.mockResolvedValue({ id: 'srv1', name: 'New Name' });

    const res = await PATCH(makeRequest('PATCH', { name: 'New Name' }));
    expect(res.status).toBe(200);
    expect(mockPrisma.server.update).toHaveBeenCalledWith({
      where: { id: 'srv1' },
      data: { name: 'New Name' },
    });
  });

  it('rejects ownerPubkey transfer for non-instance owner', async () => {
    delete process.env[ENV_KEY];
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'owner-pk', role: 'owner',
    });

    const res = await PATCH(makeRequest('PATCH', { ownerPubkey: VALID_PUBKEY }));
    expect(res.status).toBe(403);
    expect(mockPrisma.server.update).not.toHaveBeenCalled();
  });

  it('instance owner can transfer ownerPubkey', async () => {
    process.env[ENV_KEY] = 'instance-pk';
    mockGetAuth.mockResolvedValue('instance-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'old-owner' });
    mockPrisma.member.findUnique.mockResolvedValue(null); // instance owner has no Member row
    mockPrisma.member.upsert.mockResolvedValue({});
    mockPrisma.moderationAction.create.mockResolvedValue({});
    mockPrisma.server.update.mockResolvedValue({ id: 'srv1', ownerPubkey: VALID_PUBKEY });

    const res = await PATCH(makeRequest('PATCH', { ownerPubkey: VALID_PUBKEY }));
    expect(res.status).toBe(200);
    expect(mockPrisma.server.update).toHaveBeenCalledWith({
      where: { id: 'srv1' },
      data: { ownerPubkey: VALID_PUBKEY.toLowerCase() },
    });
    expect(mockPrisma.member.upsert).toHaveBeenCalled();
    expect(mockPrisma.moderationAction.create).toHaveBeenCalled();
  });

  it('rejects malformed ownerPubkey', async () => {
    process.env[ENV_KEY] = 'instance-pk';
    mockGetAuth.mockResolvedValue('instance-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'old-owner' });
    mockPrisma.member.findUnique.mockResolvedValue(null);

    const res = await PATCH(makeRequest('PATCH', { ownerPubkey: 'not-a-valid-pubkey' }));
    expect(res.status).toBe(400);
  });

  describe('welcome bot fields', () => {
    function mockOwnerAuth() {
      mockGetAuth.mockResolvedValue('owner-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'm1',
        serverId: 'srv1',
        pubkey: 'owner-pk',
        role: 'owner',
      });
    }

    it('owner can set welcomeChannelId to a valid text channel', async () => {
      mockOwnerAuth();
      mockPrisma.channel.findFirst.mockResolvedValue({ id: 'ch1' });
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', welcomeChannelId: 'ch1' });

      const res = await PATCH(
        makeRequest('PATCH', { welcomeChannelId: 'ch1', welcomeLocale: 'es' }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.channel.findFirst).toHaveBeenCalledWith({
        where: { id: 'ch1', serverId: 'srv1', type: 'text' },
        select: { id: true },
      });
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { welcomeChannelId: 'ch1', welcomeLocale: 'es' },
      });
    });

    it('owner can disable the welcome bot by sending null', async () => {
      mockOwnerAuth();
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', welcomeChannelId: null });

      const res = await PATCH(
        makeRequest('PATCH', { welcomeChannelId: null, welcomeLocale: null }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.channel.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { welcomeChannelId: null, welcomeLocale: null },
      });
    });

    it('rejects welcomeChannelId that does not match a text channel in this server', async () => {
      mockOwnerAuth();
      mockPrisma.channel.findFirst.mockResolvedValue(null);

      const res = await PATCH(makeRequest('PATCH', { welcomeChannelId: 'foreign' }));
      expect(res.status).toBe(400);
      expect(mockPrisma.server.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid welcomeLocale', async () => {
      mockOwnerAuth();

      const res = await PATCH(makeRequest('PATCH', { welcomeLocale: 'fr' }));
      expect(res.status).toBe(400);
      expect(mockPrisma.server.update).not.toHaveBeenCalled();
    });

    it('accepts welcomeLocale "en"', async () => {
      mockOwnerAuth();
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', welcomeLocale: 'en' });

      const res = await PATCH(makeRequest('PATCH', { welcomeLocale: 'en' }));
      expect(res.status).toBe(200);
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { welcomeLocale: 'en' },
      });
    });
  });

  describe('admin (non-owner) access to bot/UX fields', () => {
    function mockAdminAuth() {
      mockGetAuth.mockResolvedValue('admin-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
      });
    }

    it('admin can set welcomeChannelId + welcomeLocale', async () => {
      mockAdminAuth();
      mockPrisma.channel.findFirst.mockResolvedValue({ id: 'ch1' });
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', welcomeChannelId: 'ch1' });

      const res = await PATCH(makeRequest('PATCH', { welcomeChannelId: 'ch1', welcomeLocale: 'es' }));
      expect(res.status).toBe(200);
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { welcomeChannelId: 'ch1', welcomeLocale: 'es' },
      });
    });

    it('admin can update the banner', async () => {
      mockAdminAuth();
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', banner: 'https://example.com/b.png' });

      const res = await PATCH(makeRequest('PATCH', { banner: 'https://example.com/b.png' }));
      expect(res.status).toBe(200);
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { banner: 'https://example.com/b.png' },
      });
    });

    it('admin can set landingChannelId', async () => {
      mockAdminAuth();
      mockPrisma.channel.findFirst.mockResolvedValue({ id: 'ch2' });
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', landingChannelId: 'ch2' });

      const res = await PATCH(makeRequest('PATCH', { landingChannelId: 'ch2' }));
      expect(res.status).toBe(200);
    });

    it('admin gets 403 when trying to rename the server', async () => {
      mockAdminAuth();
      const res = await PATCH(makeRequest('PATCH', { name: 'Hijacked' }));
      expect(res.status).toBe(403);
      expect(mockPrisma.server.update).not.toHaveBeenCalled();
    });

    it('admin gets 403 when trying to change upload limits', async () => {
      mockAdminAuth();
      const res = await PATCH(makeRequest('PATCH', { maxImageBytes: 1024 }));
      expect(res.status).toBe(403);
      expect(mockPrisma.server.update).not.toHaveBeenCalled();
    });

    it('member (non-admin) still gets 403 on any PATCH', async () => {
      mockGetAuth.mockResolvedValue('member-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'm1', serverId: 'srv1', pubkey: 'member-pk', role: 'member',
      });

      const res = await PATCH(makeRequest('PATCH', { welcomeChannelId: 'ch1' }));
      expect(res.status).toBe(403);
    });
  });

  describe('landing channel field', () => {
    function mockOwnerAuth() {
      mockGetAuth.mockResolvedValue('owner-pk');
      mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
      mockPrisma.member.findUnique.mockResolvedValue({
        id: 'm1',
        serverId: 'srv1',
        pubkey: 'owner-pk',
        role: 'owner',
      });
    }

    it('owner can set landingChannelId to a valid text channel', async () => {
      mockOwnerAuth();
      mockPrisma.channel.findFirst.mockResolvedValue({ id: 'ch2' });
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', landingChannelId: 'ch2' });

      const res = await PATCH(makeRequest('PATCH', { landingChannelId: 'ch2' }));
      expect(res.status).toBe(200);
      expect(mockPrisma.channel.findFirst).toHaveBeenCalledWith({
        where: { id: 'ch2', serverId: 'srv1', type: 'text' },
        select: { id: true },
      });
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { landingChannelId: 'ch2' },
      });
    });

    it('owner can clear landingChannelId with null', async () => {
      mockOwnerAuth();
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1', landingChannelId: null });

      const res = await PATCH(makeRequest('PATCH', { landingChannelId: null }));
      expect(res.status).toBe(200);
      expect(mockPrisma.channel.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: { landingChannelId: null },
      });
    });

    it('rejects landingChannelId for a non-text or foreign channel', async () => {
      mockOwnerAuth();
      mockPrisma.channel.findFirst.mockResolvedValue(null);

      const res = await PATCH(makeRequest('PATCH', { landingChannelId: 'voice-ch' }));
      expect(res.status).toBe(400);
      expect(mockPrisma.server.update).not.toHaveBeenCalled();
    });

    it('updates landing and welcome channels independently in one request', async () => {
      mockOwnerAuth();
      mockPrisma.channel.findFirst
        .mockResolvedValueOnce({ id: 'welcome-ch' })
        .mockResolvedValueOnce({ id: 'landing-ch' });
      mockPrisma.server.update.mockResolvedValue({ id: 'srv1' });

      const res = await PATCH(
        makeRequest('PATCH', {
          welcomeChannelId: 'welcome-ch',
          welcomeLocale: 'en',
          landingChannelId: 'landing-ch',
        }),
      );
      expect(res.status).toBe(200);
      expect(mockPrisma.server.update).toHaveBeenCalledWith({
        where: { id: 'srv1' },
        data: {
          welcomeChannelId: 'welcome-ch',
          welcomeLocale: 'en',
          landingChannelId: 'landing-ch',
        },
      });
    });
  });
});

describe('DELETE /api/admin/server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it('returns 400 when serverId is missing', async () => {
    mockGetAuth.mockResolvedValue('owner-pk');
    const res = await DELETE(makeRequest('DELETE', undefined, ''));
    expect(res.status).toBe(400);
    expect(mockPrisma.server.delete).not.toHaveBeenCalled();
  });

  it('owner can delete their server', async () => {
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({ ownerPubkey: 'owner-pk' }) // for getAuthMember
      .mockResolvedValueOnce({ id: 'srv1' }); // existence check
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'owner-pk', role: 'owner',
    });
    mockPrisma.server.delete.mockResolvedValue({ id: 'srv1' });

    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockPrisma.server.delete).toHaveBeenCalledWith({ where: { id: 'srv1' } });
  });

  it('returns 403 for non-owner admin', async () => {
    mockGetAuth.mockResolvedValue('admin-pk');
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'someone-else' });
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'admin-pk', role: 'admin',
    });

    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(403);
    expect(mockPrisma.server.delete).not.toHaveBeenCalled();
  });

  it('instance owner can delete any server', async () => {
    process.env[ENV_KEY] = 'instance-pk';
    mockGetAuth.mockResolvedValue('instance-pk');
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({ ownerPubkey: 'someone-else' }) // for getAuthMember
      .mockResolvedValueOnce({ id: 'srv1' }); // existence check
    mockPrisma.member.findUnique.mockResolvedValue(null); // no member row
    mockPrisma.server.delete.mockResolvedValue({ id: 'srv1' });

    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(200);
    expect(mockPrisma.server.delete).toHaveBeenCalled();
  });

  it('returns 404 when server does not exist', async () => {
    mockGetAuth.mockResolvedValue('owner-pk');
    mockPrisma.server.findUnique
      .mockResolvedValueOnce({ ownerPubkey: 'owner-pk' }) // for getAuthMember
      .mockResolvedValueOnce(null); // existence check
    mockPrisma.member.findUnique.mockResolvedValue({
      id: 'm1', serverId: 'srv1', pubkey: 'owner-pk', role: 'owner',
    });

    const res = await DELETE(makeRequest('DELETE'));
    expect(res.status).toBe(404);
    expect(mockPrisma.server.delete).not.toHaveBeenCalled();
  });
});
