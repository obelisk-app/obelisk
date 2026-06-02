import { describe, expect, it } from 'vitest';
import { shouldUseSfuTopology } from './topology';

describe('shouldUseSfuTopology', () => {
  it('uses SFU only for voice-sfu channels without a mesh active-call override', () => {
    expect(shouldUseSfuTopology('voice-sfu', undefined)).toBe(true);
    expect(shouldUseSfuTopology('voice-sfu', 'sfu')).toBe(true);
    expect(shouldUseSfuTopology('voice-sfu', 'mesh')).toBe(false);
    expect(shouldUseSfuTopology('voice', undefined)).toBe(false);
  });
});
