import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  parseDate,
  relaySearchTerm,
  matchesTerms,
  isEmptyQuery,
  nameMatches,
} from './search-query';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);

const ctx = {
  resolvePubkey: (v: string) => {
    if (/^[0-9a-f]{64}$/i.test(v)) return v.toLowerCase();
    if (v.toLowerCase() === 'alice') return HEX_A;
    if (v.toLowerCase() === 'bob') return HEX_B;
    return null;
  },
  resolveGroup: (v: string) => (v.toLowerCase() === 'general' ? 'g-general' : null),
};

describe('parseSearchQuery', () => {
  it('splits free text into ANDable terms rather than one string', () => {
    const q = parseSearchQuery('hola mundo');
    expect(q.terms).toEqual([
      { text: 'hola', phrase: false },
      { text: 'mundo', phrase: false },
    ]);
  });

  it('keeps a quoted phrase as a single literal term', () => {
    const q = parseSearchQuery('"deployment failed" urgent');
    expect(q.terms).toEqual([
      { text: 'deployment failed', phrase: true },
      { text: 'urgent', phrase: false },
    ]);
  });

  it('strips the quote characters so they never reach the relay', () => {
    const q = parseSearchQuery('"hola mundo"');
    expect(q.terms[0].text).toBe('hola mundo');
    expect(q.terms[0].text).not.toContain('"');
  });

  it('tolerates an unterminated quote', () => {
    const q = parseSearchQuery('"still typing');
    expect(q.terms).toEqual([{ text: 'still typing', phrase: true }]);
  });

  it('treats a quoted token that looks like a filter as text', () => {
    const q = parseSearchQuery('"from:alice"', ctx);
    expect(q.authors).toEqual([]);
    expect(q.terms).toEqual([{ text: 'from:alice', phrase: true }]);
  });

  it('resolves from: by display name, not just npub/hex', () => {
    expect(parseSearchQuery('from:alice', ctx).authors).toEqual([HEX_A]);
    expect(parseSearchQuery(`from:${HEX_B}`, ctx).authors).toEqual([HEX_B]);
  });

  it('reports an unresolvable from: instead of silently dropping it', () => {
    const q = parseSearchQuery('from:nobody', ctx);
    expect(q.authors).toEqual([]);
    expect(q.unresolved).toEqual([{ key: 'from', value: 'nobody' }]);
  });

  it('resolves in: by channel name', () => {
    expect(parseSearchQuery('in:general', ctx).groupIds).toEqual(['g-general']);
    expect(parseSearchQuery('in:nope', ctx).unresolved).toEqual([{ key: 'in', value: 'nope' }]);
  });

  it('parses before:/after: into until/since', () => {
    const q = parseSearchQuery('before:2026-04-01 after:2026-03-01');
    expect(q.until).toBe(Math.floor(Date.UTC(2026, 3, 1) / 1000));
    expect(q.since).toBe(Math.floor(Date.UTC(2026, 2, 1) / 1000));
    // and they must not leak into the search terms
    expect(q.terms).toEqual([]);
  });

  it('reports a malformed date rather than searching for it as text', () => {
    const q = parseSearchQuery('before:yesterday');
    expect(q.until).toBeUndefined();
    expect(q.unresolved).toEqual([{ key: 'before', value: 'yesterday' }]);
    expect(q.terms).toEqual([]);
  });

  it('parses has: values and reports unknown ones', () => {
    expect(parseSearchQuery('has:image').has).toEqual(['image']);
    expect(parseSearchQuery('has:video').unresolved).toEqual([{ key: 'has', value: 'video' }]);
  });

  it('ignores a half-typed token with no value', () => {
    const q = parseSearchQuery('from:', ctx);
    expect(q.unresolved).toEqual([]);
    expect(q.terms).toEqual([]);
    expect(isEmptyQuery(q)).toBe(true);
  });

  it('mixes filters and free text', () => {
    const q = parseSearchQuery('from:alice in:general deployment error', ctx);
    expect(q.authors).toEqual([HEX_A]);
    expect(q.groupIds).toEqual(['g-general']);
    expect(q.terms.map((t) => t.text)).toEqual(['deployment', 'error']);
  });
});

describe('isEmptyQuery', () => {
  it('is false for a filter-only query', () => {
    // Regression: the old bar early-returned "no results" for `in:general`
    // and for `from:alice`, so a filter-only search silently showed nothing.
    expect(isEmptyQuery(parseSearchQuery('in:general', ctx))).toBe(false);
    expect(isEmptyQuery(parseSearchQuery('from:alice', ctx))).toBe(false);
    expect(isEmptyQuery(parseSearchQuery('has:image'))).toBe(false);
    expect(isEmptyQuery(parseSearchQuery('after:2026-01-01'))).toBe(false);
  });

  it('is true for blank input', () => {
    expect(isEmptyQuery(parseSearchQuery(''))).toBe(true);
    expect(isEmptyQuery(parseSearchQuery('   '))).toBe(true);
  });
});

describe('relaySearchTerm', () => {
  it('picks the longest (most selective) term', () => {
    expect(relaySearchTerm(parseSearchQuery('a deployment x').terms)).toBe('deployment');
  });

  it('prefers a quoted phrase when it is the longest', () => {
    expect(relaySearchTerm(parseSearchQuery('"deployment failed" err').terms))
      .toBe('deployment failed');
  });

  it('is undefined when the query is filters only', () => {
    expect(relaySearchTerm(parseSearchQuery('from:alice', ctx).terms)).toBeUndefined();
  });
});

describe('matchesTerms', () => {
  const terms = parseSearchQuery('hola mundo').terms;

  it('requires every term (AND), in any order', () => {
    expect(matchesTerms('hola bonito mundo', terms)).toBe(true);
    expect(matchesTerms('mundo ... hola', terms)).toBe(true);
    expect(matchesTerms('hola bonito', terms)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesTerms('HOLA MUNDO', terms)).toBe(true);
  });

  it('matches a phrase only when contiguous', () => {
    const p = parseSearchQuery('"hola mundo"').terms;
    expect(matchesTerms('hola mundo', p)).toBe(true);
    expect(matchesTerms('hola bonito mundo', p)).toBe(false);
  });

  it('matches everything when there are no terms', () => {
    expect(matchesTerms('anything', [])).toBe(true);
  });
});

describe('parseDate', () => {
  it('accepts YYYY-MM-DD at UTC midnight', () => {
    expect(parseDate('2026-01-02')).toBe(Math.floor(Date.UTC(2026, 0, 2) / 1000));
  });

  it('rejects junk and impossible dates', () => {
    expect(parseDate('nope')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
    expect(parseDate('2026-02-31')).toBeNull();
    expect(parseDate('26-01-02')).toBeNull();
  });
});

describe('nameMatches', () => {
  it('is a case-insensitive substring match, null-safe', () => {
    expect(nameMatches('Alice', 'ali')).toBe(true);
    expect(nameMatches('Alice', 'ALI')).toBe(true);
    expect(nameMatches(null, 'ali')).toBe(false);
    expect(nameMatches(undefined, 'ali')).toBe(false);
    expect(nameMatches('Bob', 'ali')).toBe(false);
  });
});
