import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    serverEmoji: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));

import { GET, POST, PATCH, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;

function makeRequest(method: string, body?: any, query = '?serverId=srv1') {
  const init: any = { method, headers: { cookie: 'session=tok' } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return new NextRequest(`http://localhost/api/admin/emojis${query}`, init);
}

function mockMemberAuth(role: string = 'member') {
  mockGetAuth.mockResolvedValue('member-pk');
  mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
  mockPrisma.member.findUnique.mockResolvedValue({
    id: 'm1',
    serverId: 'srv1',
    pubkey: 'member-pk',
    role,
  });
}

describe('GET /api/admin/emojis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 when serverId is missing', async () => {
    mockMemberAuth();
    const res = await GET(makeRequest('GET', undefined, ''));
    expect(res.status).toBe(400);
  });

  it('returns 401 for unauthed callers', async () => {
    mockGetAuth.mockResolvedValue(null);
    mockPrisma.server.findUnique.mockResolvedValue({ ownerPubkey: 'owner-pk' });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(401);
  });

  it('lists emojis for regular members', async () => {
    mockMemberAuth();
    mockPrisma.serverEmoji.findMany.mockResolvedValue([
      { id: 'e1', name: 'fire', url: '/uploads/fire.png', createdBy: 'x', createdAt: new Date() },
    ]);
    const res = await GET(makeRequest('GET'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.emojis).toHaveLength(1);
    expect(data.emojis[0].name).toBe('fire');
  });
});

describe('POST /api/admin/emojis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for non-mod members', async () => {
    mockMemberAuth('member');
    const res = await POST(
      makeRequest('POST', { name: 'party', url: '/uploads/p.png' }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.serverEmoji.create).not.toHaveBeenCalled();
  });

  it('mods can create an emoji', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.create.mockResolvedValue({
      id: 'e1',
      name: 'party',
      url: '/uploads/p.png',
      createdBy: 'member-pk',
      createdAt: new Date(),
    });
    const res = await POST(
      makeRequest('POST', { name: 'party', url: '/uploads/p.png' }),
    );
    expect(res.status).toBe(201);
    expect(mockPrisma.serverEmoji.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serverId: 'srv1',
        name: 'party',
        url: '/uploads/p.png',
        createdBy: 'member-pk',
      }),
      select: expect.any(Object),
    });
  });

  it('rejects invalid names', async () => {
    mockMemberAuth('mod');
    const res = await POST(makeRequest('POST', { name: 'A', url: '/uploads/x.png' }));
    expect(res.status).toBe(400);
    expect(mockPrisma.serverEmoji.create).not.toHaveBeenCalled();
  });

  it('rejects external URLs', async () => {
    mockMemberAuth('mod');
    const res = await POST(
      makeRequest('POST', { name: 'external', url: 'https://evil.test/pixel.gif' }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.serverEmoji.create).not.toHaveBeenCalled();
  });

  it('returns 409 on unique-constraint collision', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.create.mockRejectedValue({ code: 'P2002' });
    const res = await POST(makeRequest('POST', { name: 'dupe', url: '/uploads/d.png' }));
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/admin/emojis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for non-mod members', async () => {
    mockMemberAuth('member');
    const res = await PATCH(makeRequest('PATCH', { name: 'renamed' }, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(403);
    expect(mockPrisma.serverEmoji.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    mockMemberAuth('mod');
    const res = await PATCH(makeRequest('PATCH', { name: 'renamed' }, '?serverId=srv1'));
    expect(res.status).toBe(400);
  });

  it('rejects invalid names', async () => {
    mockMemberAuth('mod');
    const res = await PATCH(makeRequest('PATCH', { name: 'X' }, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(400);
    expect(mockPrisma.serverEmoji.updateMany).not.toHaveBeenCalled();
  });

  it('mods can rename an emoji', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.serverEmoji.findUnique.mockResolvedValue({
      id: 'e1',
      name: 'renamed',
      url: '/uploads/p.png',
      createdBy: 'x',
      createdAt: new Date(),
    });
    const res = await PATCH(makeRequest('PATCH', { name: 'renamed' }, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.serverEmoji.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1', serverId: 'srv1' },
      data: { name: 'renamed' },
    });
  });

  it('returns 404 when emoji is not in this server', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.updateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(makeRequest('PATCH', { name: 'renamed' }, '?serverId=srv1&id=ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 409 on name collision', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.updateMany.mockRejectedValue({ code: 'P2002' });
    const res = await PATCH(makeRequest('PATCH', { name: 'dupe' }, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/emojis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for non-mod members', async () => {
    mockMemberAuth('member');
    const res = await DELETE(makeRequest('DELETE', undefined, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(403);
    expect(mockPrisma.serverEmoji.deleteMany).not.toHaveBeenCalled();
  });

  it('mods can delete an emoji', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(makeRequest('DELETE', undefined, '?serverId=srv1&id=e1'));
    expect(res.status).toBe(200);
    expect(mockPrisma.serverEmoji.deleteMany).toHaveBeenCalledWith({
      where: { id: 'e1', serverId: 'srv1' },
    });
  });

  it('returns 404 when id is missing from the server', async () => {
    mockMemberAuth('mod');
    mockPrisma.serverEmoji.deleteMany.mockResolvedValue({ count: 0 });
    const res = await DELETE(makeRequest('DELETE', undefined, '?serverId=srv1&id=ghost'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when id query parameter is missing', async () => {
    mockMemberAuth('mod');
    const res = await DELETE(makeRequest('DELETE', undefined, '?serverId=srv1'));
    expect(res.status).toBe(400);
  });
});
