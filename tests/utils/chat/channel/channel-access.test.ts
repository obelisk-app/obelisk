import { describe, expect, it } from 'vitest';
import { accessFlags, accessOf } from '@/utils/chat/channel/channel-access';

describe('channel access presets', () => {
  it('reads the preset from the flags', () => {
    expect(accessOf({ isPublic: true, isRestricted: false })).toBe('public');
    expect(accessOf({ isPublic: true, isRestricted: true })).toBe('read-only');
    expect(accessOf({ isPublic: false, isRestricted: false })).toBe('private');
  });

  it('publishes each preset as its four NIP-29 flags', () => {
    expect(accessFlags('public')).toEqual({ isPublic: true, isHidden: false, isRestricted: false, isOpen: true });
    expect(accessFlags('read-only')).toEqual({ isPublic: true, isHidden: false, isRestricted: true, isOpen: false });
    expect(accessFlags('private')).toEqual({ isPublic: false, isHidden: true, isRestricted: true, isOpen: false });
  });
});
