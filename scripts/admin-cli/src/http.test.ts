import { describe, it, expect } from 'vitest';
import { extractSessionCookie } from './http';
import { parseArgs, flagString, requireFlag } from './args';

describe('extractSessionCookie', () => {
  it('parses a single Set-Cookie', () => {
    const header = 'session=abc123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800';
    expect(extractSessionCookie(header)).toBe('session=abc123');
  });

  it('parses a folded multi-cookie header', () => {
    const header = 'other=1; Path=/, session=xyz789; Path=/; HttpOnly';
    expect(extractSessionCookie(header)).toBe('session=xyz789');
  });

  it('returns null when absent', () => {
    expect(extractSessionCookie('other=1; Path=/')).toBeNull();
    expect(extractSessionCookie(null)).toBeNull();
  });
});

describe('args parser', () => {
  it('parses positionals, --flag value, --flag=value, and boolean --flag', () => {
    const r = parseArgs(['abc', '--name', 'foo', '--count=3', '--dry']);
    expect(r.positional).toEqual(['abc']);
    expect(flagString(r.flags, 'name')).toBe('foo');
    expect(flagString(r.flags, 'count')).toBe('3');
    expect(r.flags.dry).toBe(true);
  });

  it('requireFlag throws on missing', () => {
    const r = parseArgs([]);
    expect(() => requireFlag(r.flags, 'x')).toThrow(/Missing required flag --x/);
  });
});
