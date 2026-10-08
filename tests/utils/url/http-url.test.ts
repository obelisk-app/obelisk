import { describe, expect, it } from 'vitest';
import { isHttpUrl, parseHttpUrl } from '@/utils/url/http-url';

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl('https://example.com/a.png')).toBe(true);
    expect(isHttpUrl('http://example.com/a.png')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('wss://relay.example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});

describe('parseHttpUrl', () => {
  it('normalizes through URL without adding a credentials or local-host policy', () => {
    const url = parseHttpUrl('  HTTP://user:pass@LOCALHOST:80/a b?q=Hello World  ');
    expect(url?.href).toBe('http://user:pass@localhost/a%20b?q=Hello%20World');
    expect(url?.username).toBe('user');
    expect(isHttpUrl('https://user:pass@example.com')).toBe(true);
  });

  it.each([undefined, '', '/image.png', '//example.com/a', 'wss://example.com', 'data:image/png;base64,AA'])('rejects non-HTTP absolute input %s', (value) => {
    expect(parseHttpUrl(value)).toBeNull();
  });
});
