import { describe, expect, it } from 'vitest';
import { cn } from '@/utils/style/cn';

describe('cn', () => {
  it('joins truthy parts with single spaces and drops the rest', () => {
    expect(cn('a', false, 'b', null, undefined, '', 'c')).toBe('a b c');
  });

  it('returns an empty string when nothing survives', () => {
    expect(cn(false, undefined)).toBe('');
  });
});
