import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  prisma: { invoicePayment: { create: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock('@/lib/api-auth', () => ({ getAuthPubkey: vi.fn() }));
vi.mock('@/lib/bolt11', () => ({ parseBolt11: vi.fn() }));

import { POST } from './route';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseBolt11 } from '@/lib/bolt11';

const PAYER = 'npub_payer';

beforeEach(() => {
  vi.resetAllMocks();
  (getAuthPubkey as any).mockResolvedValue(PAYER);
  (parseBolt11 as any).mockReturnValue({ paymentHash: 'ph_hex', expiresAt: Math.floor(Date.now() / 1000) + 3600, amountMsat: 1000 });
});

const makeReq = (body: unknown) => new NextRequest('http://x/api/invoices/pay/claim', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

describe('POST /api/invoices/pay/claim', () => {
  it('first payer wins', async () => {
    (prisma.invoicePayment.create as any).mockResolvedValue({ id: 'ip1', paymentHash: 'ph_hex' });
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 0 });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.paymentHash).toBe('ph_hex');
  });

  it('subsequent payer loses with pending', async () => {
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 0 });
    const err = Object.assign(new Error('Unique violation'), { code: 'P2002' });
    (prisma.invoicePayment.create as any).mockRejectedValue(err);
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph_hex', status: 'pending', payerPubkey: 'other' });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('pending');
  });

  it('subsequent payer loses with already_paid', async () => {
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 0 });
    const err = Object.assign(new Error('Unique violation'), { code: 'P2002' });
    (prisma.invoicePayment.create as any).mockRejectedValue(err);
    (prisma.invoicePayment.findUnique as any).mockResolvedValue({ paymentHash: 'ph_hex', status: 'paid', payerPubkey: 'other' });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('already_paid');
  });

  it('rejects expired invoice', async () => {
    (parseBolt11 as any).mockReturnValue({ paymentHash: 'ph_hex', expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid invoice prefix', async () => {
    const res = await POST(makeReq({ invoice: 'not_a_lightning_invoice' }));
    expect(res.status).toBe(400);
  });

  it('401 when no session', async () => {
    (getAuthPubkey as any).mockResolvedValue(null);
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(res.status).toBe(401);
  });

  it('sweeps stale pending rows (>30s) before attempting claim', async () => {
    (prisma.invoicePayment.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.invoicePayment.create as any).mockResolvedValue({ id: 'ip1', paymentHash: 'ph_hex' });
    const res = await POST(makeReq({ invoice: 'lnbc...' }));
    expect(prisma.invoicePayment.deleteMany).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
