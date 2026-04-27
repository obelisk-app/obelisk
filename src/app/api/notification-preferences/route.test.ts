import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    notificationPreference: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthPubkey: vi.fn(),
}));

import { GET, PUT, DELETE } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PUBKEY = 'npub1test';

function makeReq(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://x/api/notification-preferences', {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PUBKEY);
});

describe('GET /api/notification-preferences', () => {
  it('returns rows scoped to the authed user', async () => {
    (prisma.notificationPreference.findMany as any).mockResolvedValue([
      { id: '1', pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing', mutedUntil: null },
    ]);
    const res = await GET(makeReq('GET'));
    expect(prisma.notificationPreference.findMany).toHaveBeenCalledWith({ where: { pubkey: PUBKEY } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs).toHaveLength(1);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await GET(makeReq('GET'));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/notification-preferences', () => {
  it('upserts a row', async () => {
    (prisma.notificationPreference.upsert as any).mockResolvedValue({ id: 'p1' });
    const res = await PUT(makeReq('PUT', { scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'nothing' }));
    expect(res.status).toBe(200);
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { pubkey_scopeType_scopeId: { pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1' } },
    }));
  });

  it('rejects invalid scopeType', async () => {
    const res = await PUT(makeReq('PUT', { scopeType: 'planet', scopeId: 'p1' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid notifyLevel', async () => {
    const res = await PUT(makeReq('PUT', { scopeType: 'channel', scopeId: 'ch1', notifyLevel: 'maybe' }));
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await PUT(makeReq('PUT', { scopeType: 'channel', scopeId: 'ch1' }));
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/notification-preferences', () => {
  it('deletes the row by composite key', async () => {
    (prisma.notificationPreference.delete as any).mockResolvedValue({});
    const res = await DELETE(makeReq('DELETE', { scopeType: 'channel', scopeId: 'ch1' }));
    expect(res.status).toBe(200);
    expect(prisma.notificationPreference.delete).toHaveBeenCalledWith({
      where: { pubkey_scopeType_scopeId: { pubkey: PUBKEY, scopeType: 'channel', scopeId: 'ch1' } },
    });
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE', { scopeType: 'channel', scopeId: 'ch1' }));
    expect(res.status).toBe(401);
  });
});
