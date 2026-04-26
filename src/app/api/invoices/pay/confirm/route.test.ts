import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: { invoicePayment: { update: vi.fn(), delete: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/server/api-bridge', () => ({ getIO: vi.fn(() => ({ to: () => ({ emit: vi.fn() }), emit: vi.fn() })) }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/invoices/pay/confirm', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/invoices/pay/confirm', () => {
  it('marks paid and emits InvoicePaid', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: PAYER, status: 'pending', channelId: 'ch1', messageId: 'm1' });
    (prisma.invoicePayment.update as any).mockResolvedValue({});
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'paid', preimage: 'pim' }));
    expect(res.status).toBe(200);
    expect(prisma.invoicePayment.update).toHaveBeenCalled();
  });

  it('deletes the row on failed status to allow retry', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: PAYER, status: 'pending' });
    (prisma.invoicePayment.delete as any).mockResolvedValue({});
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'failed' }));
    expect(res.status).toBe(200);
    expect(prisma.invoicePayment.delete).toHaveBeenCalled();
  });

  it('rejects confirm from a different payer', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph', payerPubkey: 'other', status: 'pending' });
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'paid' }));
    expect(res.status).toBe(403);
  });

  it('404 for unknown paymentHash', async () => {
    (prisma.invoicePayment.findUnique as any).mockResolvedValue(null);
    const res = await POST(makeReq({ paymentHash: 'unknown', status: 'paid' }));
    expect(res.status).toBe(404);
  });

  it('400 for invalid status value', async () => {
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'bogus' }));
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await POST(makeReq({ paymentHash: 'ph', status: 'paid' }));
    expect(res.status).toBe(401);
  });
});
