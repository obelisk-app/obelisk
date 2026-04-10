import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db', () => ({
  prisma: {
    server: { findUnique: vi.fn() },
    member: { findUnique: vi.fn() },
    message: { count: vi.fn() },
    invitation: { count: vi.fn() },
  },
}));

import { computeCredits } from './invite-credits';
import { prisma } from './db';

const mockPrisma = prisma as any;

const ms = (d: number) => Date.now() - d * 24 * 60 * 60 * 1000;

beforeEach(() => vi.clearAllMocks());

describe('computeCredits', () => {
  it('returns null when server not found', async () => {
    mockPrisma.server.findUnique.mockResolvedValue(null);
    mockPrisma.member.findUnique.mockResolvedValue({ joinedAt: new Date() });
    expect(await computeCredits('s1', 'pk')).toBeNull();
  });

  it('returns null when member not found', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      minDaysActive: 7, minMessages: 20, invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue(null);
    expect(await computeCredits('s1', 'pk')).toBeNull();
  });

  it('marks user eligible when both thresholds met', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      minDaysActive: 7, minMessages: 20, invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ joinedAt: new Date(ms(10)) });
    mockPrisma.message.count.mockResolvedValue(25);
    mockPrisma.invitation.count.mockResolvedValue(1);

    const c = await computeCredits('s1', 'pk');
    expect(c).not.toBeNull();
    expect(c!.eligible).toBe(true);
    expect(c!.daysActive).toBe(10);
    expect(c!.messageCount).toBe(25);
    expect(c!.used).toBe(1);
    expect(c!.available).toBe(2);
    expect(c!.reasons).toEqual([]);
  });

  it('reports remaining messages when below threshold', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      minDaysActive: 0, minMessages: 20, invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ joinedAt: new Date() });
    mockPrisma.message.count.mockResolvedValue(5);
    mockPrisma.invitation.count.mockResolvedValue(0);

    const c = await computeCredits('s1', 'pk');
    expect(c!.eligible).toBe(false);
    expect(c!.reasons.some((r) => r.includes('15 more'))).toBe(true);
  });

  it('reports remaining days when below threshold', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      minDaysActive: 7, minMessages: 0, invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ joinedAt: new Date(ms(2)) });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(0);

    const c = await computeCredits('s1', 'pk');
    expect(c!.eligible).toBe(false);
    expect(c!.reasons.some((r) => r.includes('5 more day'))).toBe(true);
  });

  it('clamps available to zero when used exceeds limit', async () => {
    mockPrisma.server.findUnique.mockResolvedValue({
      minDaysActive: 0, minMessages: 0, invitesPerUser: 3,
    });
    mockPrisma.member.findUnique.mockResolvedValue({ joinedAt: new Date() });
    mockPrisma.message.count.mockResolvedValue(0);
    mockPrisma.invitation.count.mockResolvedValue(5);

    const c = await computeCredits('s1', 'pk');
    expect(c!.available).toBe(0);
  });
});
