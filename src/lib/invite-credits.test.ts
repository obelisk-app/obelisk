import { describe, it, expect } from 'vitest';
import { isEligibleForCredits } from './invite-credits';

describe('isEligibleForCredits', () => {
  it('returns true when member joined exactly minDaysActive ago', () => {
    const joinedAt = new Date(Date.now() - 7 * 86_400_000);
    expect(isEligibleForCredits({ joinedAt }, { minDaysActive: 7 })).toBe(true);
  });

  it('returns true when member joined longer than minDaysActive ago', () => {
    const joinedAt = new Date(Date.now() - 30 * 86_400_000);
    expect(isEligibleForCredits({ joinedAt }, { minDaysActive: 7 })).toBe(true);
  });

  it('returns false when member joined less than minDaysActive ago', () => {
    const joinedAt = new Date(Date.now() - 3 * 86_400_000);
    expect(isEligibleForCredits({ joinedAt }, { minDaysActive: 7 })).toBe(false);
  });

  it('returns true when minDaysActive is 0', () => {
    const joinedAt = new Date();
    expect(isEligibleForCredits({ joinedAt }, { minDaysActive: 0 })).toBe(true);
  });

  it('returns false for a member who just joined with default threshold', () => {
    const joinedAt = new Date();
    expect(isEligibleForCredits({ joinedAt }, { minDaysActive: 7 })).toBe(false);
  });
});
