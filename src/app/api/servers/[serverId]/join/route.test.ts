import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn(), create: vi.fn() },
    ban: { findUnique: vi.fn() },
    channel: { findMany: vi.fn().mockResolvedValue([]) },
    channelReadState: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { isInWot } from '@/lib/wot';
import { postWelcomeMessage } from '@/lib/welcome';

const mockPrisma = prisma as any;
const mockGetAuth = getAuthPubkey as ReturnType<typeof vi.fn>;
const mockIsInWot = isInWot as ReturnType<typeof vi.fn>;
const mockPostWelcome = postWelcomeMessage as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ serverId: 'srv1' });

function makeRequest() {
  return new NextRequest('http://localhost/api/servers/srv1/join', {
    method: 'POST',
    headers: { cookie: 'session=tok' },
  });
}

describe('POST /api/servers/[serverId]/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.channel.findMany.mockResolvedValue([]);
    mockPrisma.channelReadState.createMany.mockResolvedValue({ count: 0 });
  });

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

  it('fires the welcome bot in the background after creating the member', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockPostWelcome.mockResolvedValue(null);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPostWelcome).toHaveBeenCalledWith('srv1', 'pk1');
  });

  it('seeds ChannelReadState=now for every text/forum channel on first join', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockPrisma.channel.findMany.mockResolvedValue([
      { id: 'c-general' },
      { id: 'c-landing' },
      { id: 'c-welcome' },
    ]);

    const before = Date.now();
    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);

    expect(mockPrisma.channel.findMany).toHaveBeenCalledWith({
      where: { serverId: 'srv1', type: { in: ['text', 'forum'] } },
      select: { id: true },
    });
    expect(mockPrisma.channelReadState.createMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.channelReadState.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(3);
    const ids = call.data.map((d: any) => d.channelId).sort();
    expect(ids).toEqual(['c-general', 'c-landing', 'c-welcome']);
    for (const row of call.data) {
      expect(row.pubkey).toBe('pk1');
      expect(row.lastReadAt).toBeInstanceOf(Date);
      expect(row.lastReadAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(row.lastReadAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it('seeds read state BEFORE firing welcome bot so the bot message lands after lastReadAt', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockPrisma.channel.findMany.mockResolvedValue([{ id: 'c-welcome' }]);

    const order: string[] = [];
    mockPrisma.channelReadState.createMany.mockImplementation(async () => {
      order.push('seed');
      return { count: 1 };
    });
    mockPostWelcome.mockImplementation(async () => {
      order.push('welcome');
      return null;
    });

    await POST(makeRequest(), { params });
    // Flush the fire-and-forget microtask.
    await new Promise((r) => setImmediate(r));

    expect(order).toEqual(['seed', 'welcome']);
  });

  it('skips the read-state seed when the server has no text/forum channels', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    mockPrisma.channel.findMany.mockResolvedValue([]);

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.channelReadState.createMany).not.toHaveBeenCalled();
  });

  it('does not reseed read state on the alreadyMember idempotent path', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ id: 'm1' });

    await POST(makeRequest(), { params });
    expect(mockPrisma.channel.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.channelReadState.createMany).not.toHaveBeenCalled();
  });

  it('returns success even if the background welcome bot rejects', async () => {
    mockGetAuth.mockResolvedValue('pk1');
    mockPrisma.server.findUnique.mockResolvedValue({
      id: 'srv1', name: 'Test', icon: null, banner: null, joinMode: 'open', wotEnabled: false,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    mockPrisma.ban.findUnique.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'm1' });
    // The route fires-and-forgets postWelcomeMessage; a rejected promise
    // must not bubble up and fail the join response. We silence the
    // unhandled-rejection warning by suppressing console.warn for this test.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockPostWelcome.mockRejectedValue(new Error('welcome bot failure'));

    const res = await POST(makeRequest(), { params });
    expect(res.status).toBe(200);
    expect(mockPrisma.member.create).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
