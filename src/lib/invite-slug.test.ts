import { describe, it, expect } from 'vitest';
import { validateSlug, normalizeSlug, RESERVED_SLUGS } from './invite-slug';

describe('invite-slug', () => {
  it('normalizes to lowercase and trims', () => {
    expect(normalizeSlug('  Obelisk  ')).toBe('obelisk');
  });

  it('accepts well-formed slugs', () => {
    for (const raw of ['obelisk', 'la-crypta', 'test_1', 'ab']) {
      const res = validateSlug(raw);
      expect(res.ok, raw).toBe(true);
    }
  });

  it('rejects empty / too short / too long', () => {
    expect(validateSlug('').ok).toBe(false);
    expect(validateSlug('a').ok).toBe(false);
    expect(validateSlug('x'.repeat(41)).ok).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(validateSlug('hello world').ok).toBe(false);
    expect(validateSlug('hey!').ok).toBe(false);
    expect(validateSlug('foo/bar').ok).toBe(false);
  });

  it('rejects reserved slugs', () => {
    for (const slug of RESERVED_SLUGS) {
      expect(validateSlug(slug).ok, slug).toBe(false);
    }
  });

  it('does not reserve "obelisk"', () => {
    expect(validateSlug('obelisk').ok).toBe(true);
  });
});
