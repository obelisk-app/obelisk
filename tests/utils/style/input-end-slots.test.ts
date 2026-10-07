import { describe, expect, it } from 'vitest';
import { endSlotCount } from '@/utils/style/input-end-slots';

describe('endSlotCount', () => {
  it('counts each control the end slot holds', () => {
    expect(endSlotCount({ loading: false, clear: false, secret: false, suffix: false })).toBe(0);
    expect(endSlotCount({ loading: true, clear: false, secret: true, suffix: false })).toBe(2);
    expect(endSlotCount({ loading: true, clear: true, secret: true, suffix: true })).toBe(4);
  });
});
