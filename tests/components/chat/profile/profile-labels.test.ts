import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { copyWithToast, popoverShortNpub, profileShortNpub, stripEmpty } from '@/components/chat/profile/profile-labels';
import { useToastStore } from '@/store/toast';

const HEX = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';

describe('stripEmpty', () => {
  it('drops null, undefined and empty-string fields', () => {
    expect(stripEmpty({ a: 'x', b: '', c: null, d: undefined, e: 0 })).toEqual({ a: 'x', e: 0 });
    expect(stripEmpty(null)).toEqual({});
  });
});

describe('short npub labels', () => {
  it('both print the shared short npub label', () => {
    const expected = shortNpubLabel(HEX);
    expect(expected).toMatch(/^npub1.{5}….{4}$/);
    expect(profileShortNpub(HEX)).toBe(expected);
    expect(popoverShortNpub(HEX)).toBe(expected);
  });

  it('the profile label falls back to trimmed text when the key does not encode', () => {
    expect(profileShortNpub('not-hex-at-all-xyz')).toBe('not-hex-at…ll-xyz');
  });
});

describe('copyWithToast', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes to the clipboard and pushes a toast', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const pushToast = vi.spyOn(useToastStore.getState(), 'pushToast');
    copyWithToast('npub1x', 'Copied', 'Alice');
    expect(writeText).toHaveBeenCalledWith('npub1x');
    expect(pushToast).toHaveBeenCalledWith({ title: 'Copied', body: 'Alice' });
    pushToast.mockRestore();
  });
});
