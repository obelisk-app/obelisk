import { describe, expect, it } from 'vitest';
import { isHttpUrl } from '@/utils/url/http-url';

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl('https://example.com/a.png')).toBe(true);
    expect(isHttpUrl('http://example.com/a.png')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('wss://relay.example.com')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
  });
});
