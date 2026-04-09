import { describe, it, expect } from 'vitest';
import { threadKey } from './dm';

describe('dm utils', () => {
  describe('threadKey', () => {
    it('returns sorted pubkeys', () => {
      expect(threadKey('b', 'a')).toEqual(['a', 'b']);
      expect(threadKey('a', 'b')).toEqual(['a', 'b']);
    });

    it('handles identical pubkeys', () => {
      expect(threadKey('a', 'a')).toEqual(['a', 'a']);
    });
  });
});
