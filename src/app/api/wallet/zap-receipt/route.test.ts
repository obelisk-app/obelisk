import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: {
    zap: { create: vi.fn() },
  },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/server/api-bridge', () => ({ getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }) })) }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/wallet/zap-receipt', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/wallet/zap-receipt', () => {
  it('records a zap with all fields', async () => {
    (prisma.zap.create as any).mockResolvedValue({ id: 'z1', createdAt: new Date() });
    const res = await POST(makeReq({
      targetPubkey: 'npub_target',
      amountMsat: 1_000_000,
      channelId: 'ch1',
      messageId: 'm1',
      paymentHash: 'ph_hex',
    }));
    expect(res.status).toBe(200);
    expect(prisma.zap.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payerPubkey: PAYER,
        targetPubkey: 'npub_target',
        paymentHash: 'ph_hex',
      }),
    });
  });

  it('rejects missing required fields', async () => {
    const res = await POST(makeReq({ targetPubkey: 'x' })); // missing amountMsat + paymentHash
    expect(res.status).toBe(400);
  });

  it('rejects non-positive amountMsat', async () => {
    const res = await POST(makeReq({ targetPubkey: 'x', amountMsat: 0, paymentHash: 'p' }));
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });
});
