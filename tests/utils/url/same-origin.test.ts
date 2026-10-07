import { describe, expect, it } from 'vitest';
import { isSameOriginMediaUrl } from '@/utils/url/same-origin';

describe('isSameOriginMediaUrl', () => {
  it('accepts relative and same-origin URLs and nothing else', () => {
    expect(isSameOriginMediaUrl('/api/welcome-banner?x=1')).toBe(true);
    expect(isSameOriginMediaUrl(`${window.location.origin}/uploads/a.png`)).toBe(true);
    expect(isSameOriginMediaUrl('https://attacker.example/api/welcome-banner')).toBe(false);
    // An opaque scheme has a null origin; a bare word would resolve as a
    // relative path, which is same-origin and correctly allowed.
    expect(isSameOriginMediaUrl('data:image/png;base64,AAAA')).toBe(false);
  });
});
